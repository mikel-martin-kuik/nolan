use crate::api::broadcast_history_entry;
use crate::config::TeamConfig;
use dashmap::DashMap;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Mutex as StdMutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::fs::File as AsyncFile;
use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader as AsyncBufReader};
use tokio::time::sleep;

// Global flag to prevent multiple streaming tasks
static STREAMING: AtomicBool = AtomicBool::new(false);

// Backpressure and debouncing constants
const MAX_PENDING_EVENTS: usize = 100; // Max queued file updates
const DEBOUNCE_MS: u64 = 25; // Debounce delay for file processing (reduced for faster streaming)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub uuid: Option<String>,
    pub timestamp: String,
    pub agent: Option<String>,
    pub tmux_session: Option<String>, // Tmux session name (e.g., "agent-bill-3")
    pub message: String,
    pub preview: String,    // Truncated message for list display
    pub entry_type: String, // "user", "assistant", "tool_use", "tool_result", "system"
    pub session_id: Option<String>,
    pub project: Option<String>,
    pub tool_name: Option<String>,
    pub tokens: Option<TokenInfo>,
    pub is_streaming: bool, // true for real-time entries, false for bulk historical load
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub input: u64,
    pub output: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct SessionRegistryEntry {
    tmux_session: String,
    #[allow(dead_code)]
    agent: String, // Stored for debugging, not currently used in lookup
    agent_dir: String,
    start_time: String,
}

// Track file positions for incremental reading
use once_cell::sync::Lazy;

static FILE_POSITIONS: Lazy<StdMutex<HashMap<PathBuf, u64>>> =
    Lazy::new(|| StdMutex::new(HashMap::new()));

// Session registry index for O(1) session lookups
// Maps agent_dir -> Vec<SessionRegistryEntry> sorted by start_time (newest first)
static SESSION_INDEX: Lazy<DashMap<String, Vec<SessionRegistryEntry>>> =
    Lazy::new(|| DashMap::new());
static INDEX_LOADED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn start_history_stream(app_handle: AppHandle) -> Result<(), String> {
    // Atomically check and set streaming flag to prevent race condition
    // compare_exchange returns Ok if value was false (successfully changed to true)
    // Returns Err if value was already true (another thread is streaming)
    match STREAMING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst) {
        Ok(_) => {
            // Starting new streaming task
        }
        Err(_) => {
            return Ok(()); // Already streaming, don't start another task
        }
    }

    // Load session index for O(1) lookups
    if let Err(e) = load_session_index().await {
        eprintln!("Warning: Failed to load session index: {}", e);
        // Non-fatal, continue without index
    }

    // Spawn background task that won't block
    tokio::spawn(async move {
        if let Err(e) = watch_transcript_files(app_handle).await {
            eprintln!("History streaming error: {}", e);
            STREAMING.store(false, Ordering::Relaxed);
        }
    });

    Ok(())
}

/// Get the projects directory path
fn get_projects_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
    Ok(PathBuf::from(home).join(".claude").join("projects"))
}

/// Watch transcript JSONL files for new entries (real-time only, no historical load)
async fn watch_transcript_files(app_handle: AppHandle) -> Result<(), String> {
    let projects_dir = get_projects_dir()?;

    if !projects_dir.exists() {
        return Err(format!("Projects directory not found: {:?}", projects_dir));
    }

    // Skip automatic historical loading to prevent freeze on startup
    // File positions are initialized lazily when files are first accessed
    // User can manually load history via load_history_entries command

    // Set up file watcher
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Watch the projects directory recursively
    watcher
        .watch(&projects_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // Process file change events with backpressure and debouncing
    let mut pending_files: VecDeque<PathBuf> = VecDeque::new();
    let mut last_process_time = tokio::time::Instant::now();

    loop {
        if !STREAMING.load(Ordering::Relaxed) {
            eprintln!("History streaming stopped by request");
            return Ok(());
        }

        // Collect events with timeout (non-blocking check)
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => {
                // Only process modify/create events on JSONL files
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    for path in event.paths {
                        if path.extension().map_or(false, |e| e == "jsonl") {
                            // Add to queue only if not already pending and under limit (backpressure)
                            if !pending_files.contains(&path)
                                && pending_files.len() < MAX_PENDING_EVENTS
                            {
                                pending_files.push_back(path);
                            } else if pending_files.len() >= MAX_PENDING_EVENTS {
                                eprintln!(
                                    "File watcher backpressure: dropping event for {:?}",
                                    path
                                );
                            }
                        }
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Normal timeout, continue to processing
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                eprintln!("Watcher channel disconnected");
                return Ok(());
            }
        }

        // Process pending files with debouncing
        if last_process_time.elapsed() >= Duration::from_millis(DEBOUNCE_MS) {
            if let Some(path) = pending_files.pop_front() {
                process_file_update(&app_handle, &path).await;
                last_process_time = tokio::time::Instant::now();
            }
        }

        // Small yield to prevent busy loop
        sleep(Duration::from_millis(10)).await;
    }
}

/// Process updates to a JSONL file
async fn process_file_update(app_handle: &AppHandle, path: &PathBuf) {
    // Get last position
    let last_pos = {
        match FILE_POSITIONS.lock() {
            Ok(guard) => *guard.get(path).unwrap_or(&0),
            Err(e) => {
                eprintln!("FILE_POSITIONS lock poisoned: {}", e);
                return;
            }
        }
    };

    // Async file operations
    if let Ok(file) = AsyncFile::open(path).await {
        let metadata = file.metadata().await.ok();
        let file_len = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        // If file is smaller than our position, it was truncated - start from beginning
        let start_pos = if file_len < last_pos { 0 } else { last_pos };

        let mut reader = AsyncBufReader::new(file);
        match reader.seek(std::io::SeekFrom::Start(start_pos)).await {
            Ok(actual_pos) => {
                // Verify seek succeeded to expected position
                if actual_pos != start_pos {
                    eprintln!("Seek mismatch: expected {}, got {}", start_pos, actual_pos);
                    return;
                }

                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    if let Ok((entry, _)) = parse_transcript_line(&line, path, true) {
                        // Emit via Tauri events (for desktop app)
                        if let Err(e) = app_handle.emit("history-entry", &entry) {
                            eprintln!("Failed to emit entry: {}", e);
                        }
                        // Broadcast via WebSocket (for browser clients)
                        broadcast_history_entry(entry);
                    }
                }

                // Update position after processing
                if let Ok(mut positions) = FILE_POSITIONS.lock() {
                    positions.insert(path.clone(), file_len);
                }
            }
            Err(e) => {
                eprintln!("Failed to seek in {:?}: {}", path, e);
            }
        }
    }
}

/// Parse a transcript JSONL line into a HistoryEntry
fn parse_transcript_line(
    line: &str,
    path: &std::path::Path,
    is_streaming: bool,
) -> Result<(HistoryEntry, i64), String> {
    let json: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|e| format!("JSON parse error: {}", e))?;

    // Extract UUID
    let uuid = json
        .get("uuid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Extract timestamp (ISO 8601 format)
    let timestamp_str = json
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    // Parse timestamp for sorting
    let timestamp_ms = chrono::DateTime::parse_from_rfc3339(timestamp_str)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0);

    // Format timestamp for display
    let display_timestamp = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(timestamp_str) {
        dt.format("%H:%M:%S").to_string()
    } else {
        timestamp_str.to_string()
    };

    // Extract session ID
    let session_id = json
        .get("sessionId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Extract entry type - refine based on content
    let base_type = json
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let entry_type = refine_entry_type(base_type, &json);

    // Extract agent from project path
    let project_str = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    let agent = extract_agent_from_path(path);

    // Extract cwd (agent directory) and find matching tmux session
    let cwd = json.get("cwd").and_then(|v| v.as_str());
    let mut tmux_session = cwd.and_then(|dir| find_tmux_session(dir));

    // Fallback: If no session found via cwd, try to infer from agent name
    if tmux_session.is_none() {
        if let Some(ref agent_name) = agent {
            tmux_session = find_session_by_agent_name(agent_name);
        }
    }

    // Extract message content
    let message = extract_message_content(&json, &entry_type);

    // Extract tool name if applicable
    let tool_name = extract_tool_name(&json, &entry_type);

    // Extract token usage
    let tokens = extract_token_usage(&json);

    let preview = truncate_smart(&message, 200);

    let entry = HistoryEntry {
        uuid,
        timestamp: display_timestamp,
        agent,
        tmux_session,
        message,
        preview,
        entry_type: entry_type.to_string(),
        session_id,
        project: project_str,
        tool_name,
        tokens,
        is_streaming,
    };

    Ok((entry, timestamp_ms))
}

/// Refine entry type based on actual content
fn refine_entry_type(base_type: &str, json: &serde_json::Value) -> String {
    if let Some(content) = json
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        for item in content {
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match item_type {
                "tool_result" => return "tool_result".to_string(),
                "tool_use" => return "tool_use".to_string(),
                _ => {}
            }
        }
    }
    base_type.to_string()
}

/// Extract agent name from file path
fn extract_agent_from_path(path: &std::path::Path) -> Option<String> {
    // Look for "agents" directory in path
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            if name == "agents" {
                // Next component is the agent name
                continue;
            }
        }
    }

    // Try to find agent from directory structure
    let path_str = path.to_string_lossy();
    if let Some(agents_idx) = path_str.find("/agents/") {
        let after_agents = &path_str[agents_idx + 8..];
        if let Some(slash_idx) = after_agents.find('/') {
            return Some(after_agents[..slash_idx].to_string());
        }
    }

    None
}

/// Load session registry into DashMap index for O(1) lookups
async fn load_session_index() -> Result<(), String> {
    if INDEX_LOADED.load(Ordering::Relaxed) {
        return Ok(());
    }

    let registry_path = crate::utils::paths::get_session_registry_path()
        .map_err(|e| format!("Failed to get session registry path: {}", e))?;

    if !registry_path.exists() {
        INDEX_LOADED.store(true, Ordering::Relaxed);
        return Ok(());
    }

    let file = AsyncFile::open(&registry_path)
        .await
        .map_err(|e| format!("Failed to open registry: {}", e))?;

    let reader = AsyncBufReader::new(file);
    let mut lines = reader.lines();

    // Build index: agent_dir -> Vec<SessionRegistryEntry>
    let mut temp_index: HashMap<String, Vec<SessionRegistryEntry>> = HashMap::new();

    while let Ok(Some(line)) = lines.next_line().await {
        if let Ok(entry) = serde_json::from_str::<SessionRegistryEntry>(&line) {
            temp_index
                .entry(entry.agent_dir.clone())
                .or_insert_with(Vec::new)
                .push(entry);
        }
    }

    // Sort each agent's sessions by start_time (newest first) and store in DashMap
    for (agent_dir, mut sessions) in temp_index {
        sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        SESSION_INDEX.insert(agent_dir, sessions);
    }

    INDEX_LOADED.store(true, Ordering::Relaxed);
    Ok(())
}

/// Update the session index with a new session entry
/// Called by lifecycle when a new session is spawned
pub fn update_session_index(tmux_session: &str, agent: &str, agent_dir: &str) {
    let entry = SessionRegistryEntry {
        tmux_session: tmux_session.to_string(),
        agent: agent.to_string(),
        agent_dir: agent_dir.to_string(),
        start_time: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    };

    // Update the in-memory index
    SESSION_INDEX
        .entry(agent_dir.to_string())
        .or_insert_with(Vec::new)
        .insert(0, entry); // Insert at front (newest first)
}

/// Find session by agent name directly (for fallback when cwd lookup fails)
fn find_session_by_agent_name(agent_name: &str) -> Option<String> {
    use crate::config::TeamConfig;
    use crate::constants::team_agent_session;
    use crate::tmux::session::session_exists;

    // Load team config to get valid agent names
    let agent_names: Vec<String> = TeamConfig::load("default")
        .map(|team| team.agent_names().iter().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    if agent_names.iter().any(|n| n == agent_name) {
        // Try team agent session pattern: agent-{team}-{name}
        let session_name = team_agent_session("default", agent_name);
        if let Ok(true) = session_exists(&session_name) {
            return Some(session_name);
        }
    }
    None
}

/// Find matching tmux session from registry based on agent directory (O(1) with index)
fn find_tmux_session(agent_dir: &str) -> Option<String> {
    use crate::tmux::session::session_exists;

    // Try to use the index first
    if INDEX_LOADED.load(Ordering::Relaxed) {
        if let Some(sessions) = SESSION_INDEX.get(agent_dir) {
            // Return the first session that actually exists in tmux
            // Limit checks to avoid excessive external calls
            for (idx, session) in sessions.value().iter().enumerate() {
                // Only check first 3 most recent sessions for performance
                if idx >= 3 {
                    break;
                }

                // Explicitly handle errors instead of hiding them
                match session_exists(&session.tmux_session) {
                    Ok(true) => return Some(session.tmux_session.clone()),
                    Ok(false) => continue,
                    Err(e) => {
                        eprintln!("Error checking session '{}': {}", session.tmux_session, e);
                        continue;
                    }
                }
            }
        }
    }

    // Fallback: Try to infer session from agent directory path
    // Look for /agents/{name}/ pattern in the path
    if let Some(agents_idx) = agent_dir.find("/agents/") {
        let after_agents = &agent_dir[agents_idx + 8..];
        // Get the agent name (first path component after /agents/)
        let agent_name = after_agents.split('/').next().unwrap_or("");

        // Load team config to check if this is a valid agent name
        let is_valid_agent = TeamConfig::load("default")
            .map(|team| team.agent_names().iter().any(|n| *n == agent_name))
            .unwrap_or(false);

        if is_valid_agent {
            // Try team agent session pattern: agent-{team}-{name}
            use crate::constants::team_agent_session;
            let session_name = team_agent_session("default", agent_name);
            if let Ok(true) = session_exists(&session_name) {
                return Some(session_name);
            }
        }
    }

    None
}

/// Extract message content from JSON based on entry type (full content, no truncation)
fn extract_message_content(json: &serde_json::Value, entry_type: &str) -> String {
    if let Some(message) = json.get("message") {
        if let Some(content) = message.get("content") {
            // Content can be a string
            if let Some(text) = content.as_str() {
                return text.trim().to_string();
            }

            // Content is an array - collect relevant parts
            if let Some(arr) = content.as_array() {
                let mut texts: Vec<String> = Vec::new();
                let mut tool_uses: Vec<String> = Vec::new();
                let mut tool_results: Vec<String> = Vec::new();

                for item in arr {
                    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match item_type {
                        "text" => {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                if !text.trim().is_empty() {
                                    texts.push(text.trim().to_string());
                                }
                            }
                        }
                        "tool_use" => {
                            let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                            // Get the full input for the popup
                            let input_str = item.get("input").map(|i| {
                                // For AskUserQuestion, always serialize full JSON for proper rendering
                                if name == "AskUserQuestion" {
                                    return serde_json::to_string_pretty(i).unwrap_or_default();
                                }
                                // For common tools, extract key info
                                if let Some(cmd) = i.get("command").and_then(|c| c.as_str()) {
                                    cmd.to_string()
                                } else if let Some(path) =
                                    i.get("file_path").and_then(|p| p.as_str())
                                {
                                    path.to_string()
                                } else if let Some(pattern) =
                                    i.get("pattern").and_then(|p| p.as_str())
                                {
                                    pattern.to_string()
                                } else {
                                    // Serialize the whole input as JSON
                                    serde_json::to_string_pretty(i).unwrap_or_default()
                                }
                            });

                            if let Some(input) = input_str {
                                tool_uses.push(format!("{}: {}", name, input));
                            } else {
                                tool_uses.push(name.to_string());
                            }
                        }
                        "tool_result" => {
                            if let Some(result_content) = item.get("content") {
                                let result_text = if let Some(s) = result_content.as_str() {
                                    s.to_string()
                                } else if let Some(arr) = result_content.as_array() {
                                    // Handle array of content blocks - collect all text
                                    arr.iter()
                                        .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                                        .collect::<Vec<_>>()
                                        .join("\n")
                                } else {
                                    String::new()
                                };

                                if !result_text.is_empty() {
                                    tool_results.push(result_text);
                                }
                            }
                        }
                        _ => {}
                    }
                }

                // Return most relevant content
                if !texts.is_empty() {
                    return texts.join("\n\n");
                }
                if !tool_uses.is_empty() {
                    return tool_uses.join("\n");
                }
                if !tool_results.is_empty() {
                    return tool_results.join("\n\n");
                }
            }
        }
    }

    // Fallback for system messages
    if entry_type == "system" {
        if let Some(msg) = json.get("message").and_then(|m| m.as_str()) {
            return msg.trim().to_string();
        }
    }

    // Empty rather than placeholder
    String::new()
}

/// Smart truncation - prefer to break at word/line boundaries
fn truncate_smart(text: &str, max_len: usize) -> String {
    let text = text.trim();

    // Get first meaningful line
    let first_line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or(text);

    if first_line.len() <= max_len {
        return first_line.to_string();
    }

    // Find the char boundary at or before max_len
    let mut boundary = max_len;
    while !first_line.is_char_boundary(boundary) && boundary > 0 {
        boundary -= 1;
    }

    if boundary == 0 {
        return String::from("...");
    }

    // Try to break at word boundary within the safe boundary
    if let Some(pos) = first_line[..boundary].rfind(' ') {
        if pos > boundary / 2 {
            return format!("{}...", &first_line[..pos]);
        }
    }

    format!("{}...", &first_line[..boundary])
}

/// Extract tool name from JSON
fn extract_tool_name(json: &serde_json::Value, entry_type: &str) -> Option<String> {
    // Extract tool name for assistant messages or refined tool_use entries
    if entry_type != "assistant" && entry_type != "tool_use" {
        return None;
    }

    if let Some(content) = json.get("message")?.get("content")?.as_array() {
        for item in content {
            if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                return item
                    .get("name")
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string());
            }
        }
    }

    None
}

/// Extract token usage from JSON
fn extract_token_usage(json: &serde_json::Value) -> Option<TokenInfo> {
    let usage = json.get("message")?.get("usage")?;

    let input = usage
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output = usage
        .get("output_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if input > 0 || output > 0 {
        Some(TokenInfo { input, output })
    } else {
        None
    }
}

#[tauri::command]
pub async fn stop_history_stream() -> Result<(), String> {
    // Mark as not streaming
    STREAMING.store(false, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn load_history_entries(
    app_handle: AppHandle,
    hours: Option<u64>,
) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let hours = hours.unwrap_or(1); // Default to last 1 hour
    let cutoff_time = std::time::SystemTime::now() - Duration::from_secs(hours * 60 * 60);

    let mut loaded_count = 0;
    let mut skipped_count = 0;

    for entry in walkdir::WalkDir::new(&projects_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "jsonl") {
            // Check file modification time (async)
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = metadata.modified() {
                    if modified >= cutoff_time {
                        process_file_update(&app_handle, &path.to_path_buf()).await;
                        loaded_count += 1;
                    } else {
                        skipped_count += 1;
                    }
                }
            }
        }
    }

    let message = format!(
        "Loaded {} sessions, skipped {} (older than {} hour(s))",
        loaded_count, skipped_count, hours
    );
    Ok(message)
}

#[tauri::command]
pub async fn load_history_for_active_sessions(
    app_handle: AppHandle,
    active_sessions: Vec<String>,
    hours: Option<u64>,
) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let hours = hours.unwrap_or(1);
    let cutoff_time = std::time::SystemTime::now() - Duration::from_secs(hours * 60 * 60);

    let mut loaded_count = 0;
    let mut entries_emitted = 0;

    // Build session index if not loaded yet
    if !INDEX_LOADED.load(Ordering::Relaxed) {
        if let Err(e) = load_session_index().await {
            eprintln!("Warning: Failed to load session index: {}", e);
        }
    }

    // Find transcript files that belong to active sessions only
    for entry in walkdir::WalkDir::new(&projects_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "jsonl") {
            // Check file modification time
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = metadata.modified() {
                    if modified < cutoff_time {
                        continue;
                    }

                    // Read file and check if any entries belong to active sessions
                    if let Ok(file) = AsyncFile::open(&path).await {
                        let reader = AsyncBufReader::new(file);
                        let mut lines = reader.lines();
                        let mut has_active_session = false;

                        // Check if this file contains entries for any active session
                        while let Ok(Some(line)) = lines.next_line().await {
                            if let Ok((entry, _)) = parse_transcript_line(&line, path, false) {
                                if let Some(ref tmux_session) = entry.tmux_session {
                                    if active_sessions.contains(tmux_session) {
                                        has_active_session = true;
                                        // Emit this entry
                                        if let Err(e) = app_handle.emit("history-entry", &entry) {
                                            eprintln!("Failed to emit entry: {}", e);
                                        } else {
                                            entries_emitted += 1;
                                        }
                                    }
                                }
                            }
                        }

                        if has_active_session {
                            loaded_count += 1;
                        }
                    }
                }
            }
        }
    }

    let message = format!(
        "Loaded {} active sessions ({} entries)",
        loaded_count, entries_emitted
    );
    Ok(message)
}
