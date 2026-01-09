//! History HTTP handlers
//!
//! Note: Real-time history streaming requires WebSocket.
//! These endpoints handle loading historical entries.

use axum::{
    extract::Query,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::fs::File as AsyncFile;
use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};

use crate::commands::history::HistoryEntry;

/// Error response
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Get the projects directory path
fn get_projects_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
    Ok(PathBuf::from(home).join(".claude").join("projects"))
}

/// Load entries query params
#[derive(Deserialize)]
pub struct LoadEntriesQuery {
    #[serde(default)]
    pub hours: Option<u64>,
}

/// Load active sessions query params
#[derive(Deserialize)]
pub struct LoadActiveSessionsQuery {
    #[serde(alias = "activeSessions")]
    pub active_sessions: Option<String>, // Comma-separated session names
    #[serde(default)]
    pub hours: Option<u64>,
}

/// Load history entries - returns entries directly as JSON
pub async fn load_entries(
    Query(query): Query<LoadEntriesQuery>,
) -> Result<Json<Vec<HistoryEntry>>, (StatusCode, Json<ErrorResponse>)> {
    let projects_dir = get_projects_dir()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e })))?;

    let hours = query.hours.unwrap_or(1);
    let cutoff_time = std::time::SystemTime::now() - Duration::from_secs(hours * 60 * 60);

    let mut entries = Vec::new();
    let empty_sessions: Vec<String> = Vec::new();

    for entry in walkdir::WalkDir::new(&projects_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "jsonl") {
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = metadata.modified() {
                    if modified >= cutoff_time {
                        if let Ok(file_entries) = read_history_file(&path.to_path_buf(), &empty_sessions).await {
                            entries.extend(file_entries);
                        }
                    }
                }
            }
        }
    }

    // Sort by timestamp
    entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    Ok(Json(entries))
}

/// Load active sessions history - returns entries directly as JSON
pub async fn load_active_sessions(
    Query(query): Query<LoadActiveSessionsQuery>,
) -> Result<Json<Vec<HistoryEntry>>, (StatusCode, Json<ErrorResponse>)> {
    let projects_dir = get_projects_dir()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e })))?;

    let hours = query.hours.unwrap_or(1);
    let cutoff_time = std::time::SystemTime::now() - Duration::from_secs(hours * 60 * 60);

    // Parse active sessions from comma-separated string
    let active_sessions: Vec<String> = query.active_sessions
        .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
        .unwrap_or_default();

    let mut entries = Vec::new();

    for entry in walkdir::WalkDir::new(&projects_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "jsonl") {
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = metadata.modified() {
                    if modified >= cutoff_time {
                        // Pass active_sessions to read_history_file so it can infer tmux_session
                        if let Ok(file_entries) = read_history_file(&path.to_path_buf(), &active_sessions).await {
                            // Filter by active sessions if specified
                            if active_sessions.is_empty() {
                                entries.extend(file_entries);
                            } else {
                                entries.extend(file_entries.into_iter().filter(|e| {
                                    e.tmux_session.as_ref()
                                        .map(|s| active_sessions.contains(s))
                                        .unwrap_or(false)
                                }));
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by timestamp
    entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    Ok(Json(entries))
}

/// Read history entries from a JSONL file
async fn read_history_file(path: &PathBuf, active_sessions: &[String]) -> Result<Vec<HistoryEntry>, String> {
    let file = AsyncFile::open(path).await
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let reader = AsyncBufReader::new(file);
    let mut lines = reader.lines();
    let mut entries = Vec::new();

    while let Ok(Some(line)) = lines.next_line().await {
        if let Ok(entry) = parse_history_line(&line, path, active_sessions) {
            entries.push(entry);
        }
    }

    Ok(entries)
}

/// Parse a JSONL line into a HistoryEntry (simplified version)
/// active_sessions is used to infer tmux_session from agent name
fn parse_history_line(line: &str, path: &PathBuf, active_sessions: &[String]) -> Result<HistoryEntry, String> {
    let json: serde_json::Value = serde_json::from_str(line.trim())
        .map_err(|e| format!("JSON parse error: {}", e))?;

    // Extract UUID
    let uuid = json.get("uuid").and_then(|v| v.as_str()).map(|s| s.to_string());

    // Extract timestamp
    let timestamp_str = json.get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let display_timestamp = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(timestamp_str) {
        dt.format("%H:%M:%S").to_string()
    } else {
        timestamp_str.to_string()
    };

    // Extract session ID
    let session_id = json.get("sessionId").and_then(|v| v.as_str()).map(|s| s.to_string());

    // Extract entry type
    let entry_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();

    // Extract project from path
    let project = path.parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    // Extract agent from path
    let agent = extract_agent_from_path(path);

    // Try to infer tmux_session from agent name and active sessions
    // Session names are like "agent-default-dan", "agent-sprint-carl", "agent-ralph-echo"
    // Agent names can be "dan", "carl", or "agent-ralph-echo" (for free agents)
    let tmux_session = agent.as_ref().and_then(|agent_name| {
        active_sessions.iter().find(|session| {
            // Direct match (for agent-ralph-* sessions)
            if *session == agent_name {
                return true;
            }
            // Match agent name at the end of session name
            // e.g., "agent-default-dan" ends with "-dan"
            if session.ends_with(&format!("-{}", agent_name)) {
                return true;
            }
            // Match session name ending with agent name (for free agents)
            // e.g., session "agent-ralph-echo" contains agent name "agent-ralph-echo"
            if session.contains(agent_name) {
                return true;
            }
            false
        }).cloned()
    });

    // Extract message content (simplified)
    let message = extract_message_content(&json);
    let preview = truncate_smart(&message, 200);

    // Extract tool name
    let tool_name = json.get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|item| item.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
                .and_then(|item| item.get("name").and_then(|n| n.as_str()))
                .map(|s| s.to_string())
        });

    // Extract token usage
    let tokens = json.get("message")
        .and_then(|m| m.get("usage"))
        .map(|usage| {
            crate::commands::history::TokenInfo {
                input: usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                output: usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            }
        })
        .filter(|t| t.input > 0 || t.output > 0);

    Ok(HistoryEntry {
        uuid,
        timestamp: display_timestamp,
        agent,
        tmux_session,
        message,
        preview,
        entry_type,
        session_id,
        project,
        tool_name,
        tokens,
        is_streaming: false,
    })
}

/// Extract agent name from file path
/// The path looks like: /home/user/.claude/projects/-home-user-Projects-app-agents-agentname/xxx.jsonl
/// We need to extract "agentname" from the encoded project path
fn extract_agent_from_path(path: &PathBuf) -> Option<String> {
    let path_str = path.to_string_lossy();

    // First try: look for /agents/ in the actual path
    if let Some(agents_idx) = path_str.find("/agents/") {
        let after_agents = &path_str[agents_idx + 8..];
        if let Some(slash_idx) = after_agents.find('/') {
            return Some(after_agents[..slash_idx].to_string());
        }
    }

    // Second try: look for -agents- in the encoded project directory name
    // Path: /.../.claude/projects/-home-user-...-agents-agentname/xxx.jsonl
    // Agent names can contain dashes (e.g., "agent-ralph-echo")
    if let Some(parent) = path.parent() {
        let parent_name = parent.file_name()?.to_string_lossy();
        if let Some(agents_idx) = parent_name.find("-agents-") {
            // Take everything after "-agents-" as the agent name
            let agent_name = &parent_name[agents_idx + 8..];
            if !agent_name.is_empty() {
                return Some(agent_name.to_string());
            }
        }
    }

    None
}

/// Extract message content from JSON
fn extract_message_content(json: &serde_json::Value) -> String {
    if let Some(message) = json.get("message") {
        if let Some(content) = message.get("content") {
            if let Some(text) = content.as_str() {
                return text.trim().to_string();
            }

            if let Some(arr) = content.as_array() {
                for item in arr {
                    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if item_type == "text" {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.trim().is_empty() {
                                return text.trim().to_string();
                            }
                        }
                    }
                }
            }
        }
    }
    String::new()
}

/// Smart truncation
fn truncate_smart(text: &str, max_len: usize) -> String {
    let text = text.trim();
    let first_line = text.lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or(text);

    if first_line.len() <= max_len {
        return first_line.to_string();
    }

    let mut boundary = max_len;
    while !first_line.is_char_boundary(boundary) && boundary > 0 {
        boundary -= 1;
    }

    if boundary == 0 {
        return String::from("...");
    }

    if let Some(pos) = first_line[..boundary].rfind(' ') {
        if pos > boundary / 2 {
            return format!("{}...", &first_line[..pos]);
        }
    }

    format!("{}...", &first_line[..boundary])
}
