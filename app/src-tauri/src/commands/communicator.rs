use serde::Serialize;

// Valid agent names
const VALID_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo", "ralph"];

/// Send a message to a specific agent session using tmux
/// SECURITY: Uses -l flag to send literal text (prevents command injection)
fn send_to_tmux_session(session: &str, message: &str) -> Result<String, String> {
    use std::process::Command;

    // Send the message as literal text (SECURITY: -l flag)
    let output = Command::new("tmux")
        .arg("send-keys")
        .arg("-t")
        .arg(session)
        .arg("-l") // CRITICAL: Literal mode - prevents command injection
        .arg(message)
        .output()
        .map_err(|e| format!("Failed to send message: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux send-keys failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Send Enter key separately
    let enter_output = Command::new("tmux")
        .arg("send-keys")
        .arg("-t")
        .arg(session)
        .arg("C-m") // Carriage return (Enter)
        .output()
        .map_err(|e| format!("Failed to send Enter: {}", e))?;

    if !enter_output.status.success() {
        return Err(format!(
            "tmux send Enter failed: {}",
            String::from_utf8_lossy(&enter_output.stderr)
        ));
    }

    Ok(format!("Message sent to {}", session))
}

/// Send a message to a specific agent
#[tauri::command]
pub async fn send_message(target: String, message: String) -> Result<String, String> {
    // Validate target is a valid agent name
    if !VALID_AGENTS.contains(&target.as_str()) {
        return Err(format!(
            "Invalid target: '{}'. Valid agents: {:?}",
            target, VALID_AGENTS
        ));
    }

    let session = format!("agent-{}", target);

    // Check if session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' not found. Agent may not be running.", session));
    }

    send_to_tmux_session(&session, &message)
}

/// Broadcast a message to the core team (Ana, Bill, Carl, Dan, Enzo)
#[tauri::command]
pub async fn broadcast_team(message: String) -> Result<BroadcastResult, String> {
    let team = vec!["ana", "bill", "carl", "dan", "enzo"];
    let mut successful = Vec::new();
    let mut failed = Vec::new();

    for agent in team {
        let session = format!("agent-{}", agent);
        if crate::tmux::session::session_exists(&session).unwrap_or(false) {
            match send_to_tmux_session(&session, &message) {
                Ok(_) => successful.push(agent.to_string()),
                Err(e) => failed.push(format!("{}: {}", agent, e)),
            }
        } else {
            failed.push(format!("{}: session not active", agent));
        }
    }

    Ok(BroadcastResult {
        successful,
        failed,
        total: 5,
    })
}

/// Broadcast a message to all active agent sessions (core + spawned)
#[tauri::command]
pub async fn broadcast_all(message: String) -> Result<BroadcastResult, String> {
    let sessions = crate::tmux::session::list_sessions()?;

    let mut successful = Vec::new();
    let mut failed = Vec::new();
    let mut total = 0;

    for session in sessions {
        // Only send to agent-* sessions
        if session.starts_with("agent-") {
            total += 1;
            match send_to_tmux_session(&session, &message) {
                Ok(_) => successful.push(session),
                Err(e) => failed.push(format!("{}: {}", session, e)),
            }
        }
    }

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
            let re_core = regex::Regex::new(r"^agent-([a-z]+)$").unwrap();
            let re_spawned = regex::Regex::new(r"^agent-([a-z]+)[2-5]$").unwrap();

            if let Some(caps) = re_core.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
                    core_agents.push(agent_name);
                }
            } else if re_spawned.is_match(&session) {
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
