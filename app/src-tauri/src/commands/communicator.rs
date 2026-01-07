use serde::Serialize;
use regex::Regex;
use std::process::Command;
use std::time::{Duration, Instant};
use std::thread;
use once_cell::sync::Lazy;
use uuid::Uuid;
use crate::config::TeamConfig;

// Compile regex patterns once at startup
static RE_AGENT_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)$").expect("Invalid regex pattern for agent name")
});

static RE_AGENT_INSTANCE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)-[a-z0-9]+$").expect("Invalid regex pattern for agent instance")
});

static RE_SESSION_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)$").expect("Invalid regex pattern for session name")
});

static RE_SESSION_INSTANCE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)-[a-z0-9]+$").expect("Invalid regex pattern for session instance")
});

// Message delivery configuration
const DEFAULT_TIMEOUT_SECS: u64 = 5;
const DEFAULT_RETRY_COUNT: u32 = 2;
const POLL_INTERVAL_MS: u64 = 200;

/// Generate a unique message ID with sender identity
/// Format: MSG_<SENDER>_<8-hex-chars>
/// - sender: The agent name or "USER" for messages from Nolan app
fn generate_message_id(sender: &str) -> String {
    let uuid = Uuid::new_v4();
    // Take first 8 hex characters from UUID
    let sender_upper = sender.to_uppercase();
    format!("MSG_{}_{}", sender_upper, &uuid.simple().to_string()[..8])
}

/// Check if tmux pane is in copy-mode and exit it
fn exit_copy_mode(session: &str) -> Result<(), String> {
    // Check if in copy mode
    let output = Command::new("tmux")
        .args(&["display-message", "-t", session, "-p", "#{pane_in_mode}"])
        .output()
        .map_err(|e| format!("Failed to check copy mode: {}", e))?;

    let mode = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if mode == "1" {
        // Send 'q' to exit copy-mode
        let _ = Command::new("tmux")
            .args(&["send-keys", "-t", session, "q"])
            .output();
        thread::sleep(Duration::from_millis(100));

        // Verify exit worked, try Escape as fallback
        let output = Command::new("tmux")
            .args(&["display-message", "-t", session, "-p", "#{pane_in_mode}"])
            .output()
            .map_err(|e| format!("Failed to verify copy mode exit: {}", e))?;

        let mode = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if mode == "1" {
            let _ = Command::new("tmux")
                .args(&["send-keys", "-t", session, "Escape"])
                .output();
            thread::sleep(Duration::from_millis(100));
        }
    }

    Ok(())
}

/// Capture tmux pane content (last N lines of scrollback)
fn capture_pane(session: &str, scrollback_lines: i32) -> Result<String, String> {
    let output = Command::new("tmux")
        .args(&["capture-pane", "-t", session, "-p", "-S", &format!("-{}", scrollback_lines)])
        .output()
        .map_err(|e| format!("Failed to capture pane: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Try to force submit by sending C-m if message appears stuck
fn try_force_submit(session: &str, msg_id: &str) -> Result<bool, String> {
    // Check if message is in input prompt or visible
    let pane_content = capture_pane(session, 200)?;

    // If we see the prompt ">" or the message ID or paste indicator, force submit
    if pane_content.contains(">") || pane_content.contains(msg_id) || pane_content.contains("[Pasted text #") {
        thread::sleep(Duration::from_millis(100));
        let _ = Command::new("tmux")
            .args(&["send-keys", "-t", session, "C-m"])
            .output();
        thread::sleep(Duration::from_millis(500));

        // Check if message now appears in pane
        let pane_content = capture_pane(session, 200)?;
        if pane_content.contains(msg_id) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Check if agent session exists
fn agent_session_exists(agent: &str) -> bool {
    let session = format!("agent-{}", agent);
    crate::tmux::session::session_exists(&session).unwrap_or(false)
}

/// Native verified message delivery with message IDs, retry logic, and delivery confirmation
/// Returns the message ID on success
/// - sender: Who is sending the message (e.g., "USER" for app, or agent name for handoffs)
fn send_verified_native(
    agent: &str,
    message: &str,
    sender: &str,
    timeout_secs: u64,
    retry_count: u32,
) -> Result<String, String> {
    let session = format!("agent-{}", agent);

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Agent '{}' not found or offline", agent));
    }

    let msg_id = generate_message_id(sender);
    let prefixed_msg = format!("{}: {}", msg_id, message);

    for attempt in 0..=retry_count {
        if attempt > 0 {
            // Log retry (visible in Tauri debug logs)
            eprintln!("Retry {} of {} for {}", attempt, retry_count, agent);
        }

        // Exit copy-mode if active (prevents messages going to scroll buffer)
        exit_copy_mode(&session)?;

        // Send message with ID prefix using literal mode
        let output = Command::new("tmux")
            .args(&["send-keys", "-t", &session, "-l", &prefixed_msg])
            .output()
            .map_err(|e| format!("Failed to send message: {}", e))?;

        if !output.status.success() {
            return Err(format!("tmux send-keys failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        // Small delay before sending Enter
        thread::sleep(Duration::from_millis(50));

        // Send C-m (Enter) to submit
        let output = Command::new("tmux")
            .args(&["send-keys", "-t", &session, "C-m"])
            .output()
            .map_err(|e| format!("Failed to send enter: {}", e))?;

        if !output.status.success() {
            return Err(format!("tmux send-keys C-m failed: {}", String::from_utf8_lossy(&output.stderr)));
        }

        // Poll for delivery confirmation
        let start = Instant::now();
        let mut pasted_seen = false;

        while start.elapsed().as_secs() < timeout_secs {
            let pane_content = capture_pane(&session, 200)?;

            // Check if message ID appears in the agent's pane (indicating it was received)
            if pane_content.contains(&msg_id) {
                return Ok(msg_id);
            }

            // Check for [Pasted text #N +X lines] indicator (Claude Code paste mode)
            // When this appears, the MSG_ID is hidden - we need to wait for submission
            if pane_content.contains("[Pasted text #") {
                if !pasted_seen {
                    pasted_seen = true;
                    // Message is in paste buffer but not yet visible
                    // The C-m was already sent, just wait for processing
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }
            }

            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        // Timeout - try force submit
        if try_force_submit(&session, &msg_id)? {
            return Ok(msg_id);
        }
    }

    Err(format!("Timeout: Failed to deliver to '{}' after {} attempts", agent, retry_count + 1))
}

/// Send a message to a specific agent
#[tauri::command]
pub async fn send_message(target: String, message: String) -> Result<String, String> {
    // Load team config to get valid agent names
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let valid_agents: Vec<&str> = team.agent_names();

    // Validate target is either:
    // 1. A core agent name (e.g., "ana", "bill")
    // 2. A spawned session name (e.g., "ana-2", "bill-3")

    let is_valid = if let Some(caps) = RE_AGENT_NAME.captures(&target) {
        // Core agent name
        valid_agents.contains(&&caps[1])
    } else if let Some(caps) = RE_AGENT_INSTANCE.captures(&target) {
        // Spawned session name
        valid_agents.contains(&&caps[1])
    } else {
        false
    };

    if !is_valid {
        return Err(format!(
            "Invalid target: '{}'. Expected agent name or spawned session (e.g., 'ana' or 'ana-2')",
            target
        ));
    }

    // Use native send_verified with default timeout
    // Messages from Nolan app are always from "USER" (the human)
    send_verified_native(&target, &message, "USER", DEFAULT_TIMEOUT_SECS, DEFAULT_RETRY_COUNT)
}

/// Broadcast a message to the core team (workflow participants from team config)
#[tauri::command]
pub async fn broadcast_team(message: String) -> Result<BroadcastResult, String> {
    // Load team config
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    let mut successful = Vec::new();
    let mut failed = Vec::new();

    for agent in team.workflow_participants() {
        // Check if agent session exists before sending
        if !agent_session_exists(agent) {
            continue; // Skip offline agents
        }

        // Broadcasts from app are from USER
        match send_verified_native(agent, &message, "USER", DEFAULT_TIMEOUT_SECS, DEFAULT_RETRY_COUNT) {
            Ok(msg_id) => successful.push(format!("{} ({})", agent, msg_id)),
            Err(e) => failed.push(format!("{}: {}", agent, e)),
        }
    }

    let total = successful.len() + failed.len();

    Ok(BroadcastResult {
        successful,
        failed,
        total,
    })
}

/// Broadcast a message to all active agent sessions (core + spawned)
#[tauri::command]
pub async fn broadcast_all(message: String) -> Result<BroadcastResult, String> {
    // Load team config to get valid agent names
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let valid_agents: Vec<&str> = team.agent_names();

    let sessions = crate::tmux::session::list_sessions()?;

    let mut successful = Vec::new();
    let mut failed = Vec::new();

    for session in sessions {
        // Extract agent name from session (agent-{name} or agent-{name}-{N})
        let agent_name = if let Some(caps) = RE_SESSION_NAME.captures(&session) {
            caps[1].to_string()
        } else if RE_SESSION_INSTANCE.is_match(&session) {
            // For spawned instances, use full identifier (e.g., "ana-2")
            session.strip_prefix("agent-").unwrap_or(&session).to_string()
        } else {
            continue; // Not an agent session
        };

        // Validate it's a real agent
        let base_agent = agent_name.split('-').next().unwrap_or(&agent_name);
        if !valid_agents.contains(&base_agent) {
            continue;
        }

        // Broadcasts from app are from USER
        match send_verified_native(&agent_name, &message, "USER", DEFAULT_TIMEOUT_SECS, DEFAULT_RETRY_COUNT) {
            Ok(msg_id) => successful.push(format!("{} ({})", agent_name, msg_id)),
            Err(e) => failed.push(format!("{}: {}", agent_name, e)),
        }
    }

    let total = successful.len() + failed.len();

    Ok(BroadcastResult {
        successful,
        failed,
        total,
    })
}

/// Get list of available message targets (active agent sessions)
#[tauri::command]
pub async fn get_available_targets() -> Result<TargetList, String> {
    // Load team config to get valid agent names
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let valid_agents: Vec<&str> = team.agent_names();

    let sessions = crate::tmux::session::list_sessions()?;

    let mut core_agents = Vec::new();
    let mut spawned_sessions = Vec::new();

    for session in sessions {
        if session.starts_with("agent-") {
            // Check if it's a core agent (agent-{name} without number)
            if let Some(caps) = RE_SESSION_NAME.captures(&session) {
                let agent_name = caps[1].to_string();
                if valid_agents.contains(&agent_name.as_str()) {
                    core_agents.push(agent_name);
                }
            } else if RE_SESSION_INSTANCE.is_match(&session) {
                spawned_sessions.push(session);
            }
        }
    }

    Ok(TargetList {
        core_agents,
        spawned_sessions,
    })
}

// Data structures

#[derive(Serialize)]
pub struct BroadcastResult {
    pub successful: Vec<String>,
    pub failed: Vec<String>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct TargetList {
    pub core_agents: Vec<String>,
    pub spawned_sessions: Vec<String>,
}
