use serde::Serialize;
use regex::Regex;
use shell_escape::escape;
use std::process::Command;
use once_cell::sync::Lazy;

// Valid agent names
const VALID_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo", "ralph"];

// Compile regex patterns once at startup to avoid repeated compilation
static RE_AGENT_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)$").expect("Invalid regex pattern for agent name")
});

static RE_AGENT_INSTANCE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)-[0-9]+$").expect("Invalid regex pattern for agent instance")
});

static RE_SESSION_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)$").expect("Invalid regex pattern for session name")
});

static RE_SESSION_INSTANCE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)-[0-9]+$").expect("Invalid regex pattern for session instance")
});

/// Parse message ID from send_verified output
/// Expected format: "✓ Delivered to {agent}: MSG_12345678"
fn parse_message_id(output: &str) -> Option<String> {
    let re = Regex::new(r"✓ Delivered to [a-z0-9_-]+: (MSG_[a-f0-9]{8})").ok()?;
    let caps = re.captures(output)?;
    caps.get(1).map(|m| m.as_str().to_string())  // Safe access instead of indexing
}

/// Send a verified message using team-aliases.sh send_verified function
/// This provides message IDs, delivery confirmation, and retry logic
/// SECURITY: Uses shell-escape to prevent command injection
fn send_verified(agent: &str, message: &str, timeout: u32) -> Result<String, String> {
    let nolan_root = crate::constants::get_nolan_root()?;

    let escaped_agent = escape(agent.into());
    let escaped_message = escape(message.into());
    let escaped_root = escape(nolan_root.as_str().into());

    let script = format!(
        "source {}/app/scripts/team-aliases.sh && send_verified {} {} {}",
        escaped_root, escaped_agent, escaped_message, timeout
    );

    let output = Command::new("bash")
        .arg("-c")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute send_verified: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Map exit codes to specific errors
    match output.status.code() {
        Some(0) => {
            // Success - parse message ID from output
            parse_message_id(&stdout)
                .ok_or_else(|| format!("Failed to parse message ID from: {}", stdout))
        },
        Some(1) => Err(format!("Timeout: Failed to deliver to '{}'", agent)),
        Some(2) => Err(format!("Agent '{}' not found or offline", agent)),
        Some(code) => Err(format!("send_verified failed with code {}: {}", code, stderr)),
        None => Err("send_verified terminated by signal".to_string()),
    }
}

/// Send a message to a specific agent
#[tauri::command]
pub async fn send_message(target: String, message: String) -> Result<String, String> {
    // Validate target is either:
    // 1. A core agent name (e.g., "ana", "bill")
    // 2. A spawned session name (e.g., "ana-2", "bill-3")

    let is_valid = if let Some(caps) = RE_AGENT_NAME.captures(&target) {
        // Core agent name
        VALID_AGENTS.contains(&&caps[1])
    } else if let Some(caps) = RE_AGENT_INSTANCE.captures(&target) {
        // Spawned session name
        VALID_AGENTS.contains(&&caps[1])
    } else {
        false
    };

    if !is_valid {
        return Err(format!(
            "Invalid target: '{}'. Expected agent name or spawned session (e.g., 'ana' or 'ana-2')",
            target
        ));
    }

    // Use send_verified from team-aliases.sh with 5 second timeout
    send_verified(&target, &message, 5)
}

/// Extract agent name from delivery confirmation line
/// Expected format: "✓ Delivered to {agent}: MSG_12345678"
fn extract_agent_from_line(line: &str) -> Option<String> {
    let re = Regex::new(r"✓ Delivered to ([a-z0-9_-]+):").ok()?;
    re.captures(line).map(|caps| caps[1].to_string())
}

/// Broadcast a message to the core team (Ana, Bill, Carl, Dan, Enzo)
#[tauri::command]
pub async fn broadcast_team(message: String) -> Result<BroadcastResult, String> {
    let nolan_root = crate::constants::get_nolan_root()?;

    let escaped_message = escape(message.as_str().into());
    let escaped_root = escape(nolan_root.as_str().into());

    let script = format!(
        "source {}/app/scripts/team-aliases.sh && team {}",
        escaped_root, escaped_message
    );

    let output = Command::new("bash")
        .arg("-c")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute team broadcast: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut successful = Vec::new();
    let mut failed = Vec::new();

    for line in stdout.lines() {
        if line.starts_with("✓ Delivered to") {
            if let Some(agent) = extract_agent_from_line(line) {
                successful.push(agent);
            }
        } else if line.starts_with("✗") {
            failed.push(line.trim_start_matches("✗ ").to_string());
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
    let nolan_root = crate::constants::get_nolan_root()?;

    let escaped_message = escape(message.as_str().into());
    let escaped_root = escape(nolan_root.as_str().into());

    let script = format!(
        "source {}/app/scripts/team-aliases.sh && all {}",
        escaped_root, escaped_message
    );

    let output = Command::new("bash")
        .arg("-c")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute all broadcast: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut successful = Vec::new();
    let mut failed = Vec::new();

    for line in stdout.lines() {
        if line.starts_with("✓ Delivered to") {
            if let Some(agent) = extract_agent_from_line(line) {
                successful.push(agent);
            }
        } else if line.starts_with("✗") {
            failed.push(line.trim_start_matches("✗ ").to_string());
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
    let sessions = crate::tmux::session::list_sessions()?;

    let mut core_agents = Vec::new();
    let mut spawned_sessions = Vec::new();

    for session in sessions {
        if session.starts_with("agent-") {
            // Check if it's a core agent (agent-{name} without number)
            if let Some(caps) = RE_SESSION_NAME.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
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
