use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use crate::constants::{
    VALID_AGENTS,
    PROTECTED_SESSIONS,
    RE_AGENT_SESSION,
    RE_CORE_AGENT,
    RE_SPAWNED_AGENT,
};

/// Helper function to emit agent status change event
async fn emit_status_change(app_handle: &AppHandle) {
    // Small delay to allow tmux sessions to stabilize
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    if let Ok(status) = get_agent_status().await {
        let _ = app_handle.emit("agent-status-changed", status);
    }
}

/// Validates that a session name is a valid agent session
fn validate_agent_session(session: &str) -> Result<(), String> {
    // Must match: agent-{name} or agent-{name}-{number}
    // Examples: agent-ana, agent-bill-2, agent-carl-3
    let Some(caps) = RE_AGENT_SESSION.captures(session) else {
        return Err(format!(
            "Invalid session name format: '{}'. Expected: agent-{{name}}[-{{number}}]",
            session
        ));
    };

    // Validate agent name
    let agent_name = &caps[1];
    if !VALID_AGENTS.contains(&agent_name) {
        return Err(format!(
            "Invalid agent name: '{}'. Valid agents: {:?}",
            agent_name, VALID_AGENTS
        ));
    }

    // Prevent killing protected infrastructure
    if PROTECTED_SESSIONS.iter().any(|p| session.contains(p)) {
        return Err(format!(
            "Cannot operate on protected infrastructure session: '{}'",
            session
        ));
    }

    Ok(())
}

/// Validates agent name for spawn operations
fn validate_agent_name(agent: &str) -> Result<(), String> {
    if !VALID_AGENTS.contains(&agent) {
        return Err(format!(
            "Invalid agent: '{}'. Valid agents: {:?}",
            agent, VALID_AGENTS
        ));
    }
    Ok(())
}

/// Launch core team agents
#[tauri::command]
pub async fn launch_core(app_handle: AppHandle) -> Result<String, String> {
    let result = crate::commands::execute_script("launch-core.sh".to_string(), vec![]).await;

    // Emit status change event after operation
    if result.is_ok() {
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            emit_status_change(&app_clone).await;
        });
    }

    result
}

/// Kill all core team agents (requires user confirmation in frontend)
#[tauri::command]
pub async fn kill_core(app_handle: AppHandle) -> Result<String, String> {
    let result = crate::commands::execute_script("kill-core.sh".to_string(), vec![]).await;

    // Emit status change event after operation
    if result.is_ok() {
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            emit_status_change(&app_clone).await;
        });
    }

    result
}

/// Spawn a new agent instance
#[tauri::command]
pub async fn spawn_agent(app_handle: AppHandle, agent: String, force: bool) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent)?;

    // Build args: spawn-agent.sh expects "spawn <agent> [--force] [--no-attach]"
    let mut args = vec!["spawn".to_string(), agent];
    if force {
        args.push("--force".to_string());
    }
    // GUI will handle terminal opening, so skip auto-attach
    args.push("--no-attach".to_string());

    // Execute spawn-agent.sh
    let result = crate::commands::execute_script("spawn-agent.sh".to_string(), args).await;

    // Emit status change event after operation
    if result.is_ok() {
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            emit_status_change(&app_clone).await;
        });
    }

    result
}

/// Restart a core agent (creates unnumbered session: agent-{name})
#[tauri::command]
pub async fn restart_core_agent(app_handle: AppHandle, agent: String) -> Result<String, String> {
    use std::process::Command;

    // Validate agent name
    validate_agent_name(&agent)?;

    let session = format!("agent-{}", agent);

    // Check if session already exists
    if crate::tmux::session::session_exists(&session)? {
        return Err(format!(
            "Core agent '{}' is already running. Kill it first or use spawn to create additional instances.",
            agent
        ));
    }

    // Get paths using utility functions (handles path detection properly)
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    let agent_dir = crate::utils::paths::get_agents_dir()?.join(&agent);

    // Verify agent directory exists
    if !agent_dir.exists() {
        return Err(format!("Agent directory not found: {:?}", agent_dir));
    }

    // Convert paths to strings for command
    let nolan_root_str = nolan_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let agent_dir_str = agent_dir.to_string_lossy();

    // Determine model (same mapping as launch-core.sh)
    let model = match agent.as_str() {
        "ralph" => "haiku",
        _ => "sonnet",
    };

    // Create tmux session (same as launch-core.sh)
    let cmd = format!(
        "export AGENT_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
        agent, nolan_root_str, projects_dir_str, agent_dir_str, model
    );

    let output = Command::new("tmux")
        .args(&["new-session", "-d", "-s", &session, "-c", agent_dir_str.as_ref(), &cmd])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to start core agent session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Emit status change event after successful restart
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    Ok(format!("Restarted core agent: {}", session))
}

/// Kill a specific agent instance
#[tauri::command]
pub async fn kill_instance(app_handle: AppHandle, session: String) -> Result<String, String> {
    // SECURITY: Validate session name before killing
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Kill the session
    crate::tmux::session::kill_session(&session)?;

    // Emit status change event after successful kill
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    Ok(format!("Killed session: {}", session))
}

/// Kill all spawned instances of an agent
#[tauri::command]
pub async fn kill_all_instances(app_handle: AppHandle, agent: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent)?;

    // Find all spawned instances: agent-{name}-2, agent-{name}-3, etc.
    let sessions = crate::tmux::session::list_sessions()?;
    let pattern = format!("^agent-{}-[0-9]+$", agent);
    let re = Regex::new(&pattern)
        .map_err(|e| format!("Invalid regex pattern: {}", e))?;

    let mut killed: Vec<String> = Vec::new();
    for session in &sessions {
        if re.is_match(session) {
            if crate::tmux::session::kill_session(session).is_ok() {
                killed.push(session.to_string());
            }
        }
    }

    // Emit status change event if any sessions were killed
    if !killed.is_empty() {
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            emit_status_change(&app_clone).await;
        });
    }

    if killed.is_empty() {
        Ok(format!("No spawned instances of {} found", agent))
    } else {
        Ok(format!(
            "Killed {} instances: {}",
            killed.len(),
            killed.join(", ")
        ))
    }
}

/// Parse context usage from Claude statusline
/// Expected format: "  {agent} | {model} | {percentage}% | ${cost}"
fn parse_context_usage(session: &str) -> Option<u8> {
    use std::process::Command;

    // Capture last 5 lines from tmux pane
    let output = Command::new("tmux")
        .args(&["capture-pane", "-t", session, "-p", "-S", "-5"])
        .output()
        .ok()?;

    let content = String::from_utf8_lossy(&output.stdout);

    // Look for statusline pattern: "  agent | model | XX% | $Y.YY"
    let re = Regex::new(r"^\s+\w+\s+\|\s+[\w\s.]+\s+\|\s+(\d+)%").ok()?;

    for line in content.lines().rev() {
        if let Some(caps) = re.captures(line) {
            if let Ok(percentage) = caps[1].parse::<u8>() {
                return Some(percentage);
            }
        }
    }

    None
}

/// Get status of all agents
#[tauri::command]
pub async fn get_agent_status() -> Result<AgentStatusList, String> {
    let sessions = crate::tmux::session::list_sessions()?;

    // Filter to agent-* sessions only
    let mut core_agents = Vec::new();
    let mut spawned_sessions = Vec::new();

    for session in sessions {
        if session.starts_with("agent-") {
            // Check if it's a core agent (agent-{name} without number)
            if let Some(caps) = RE_CORE_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
                    // Get session info
                    if let Ok(info) = crate::tmux::session::get_session_info(&session) {
                        // Parse context usage from statusline
                        let context_usage = parse_context_usage(&session);

                        core_agents.push(AgentStatus {
                            name: agent_name,
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                            context_usage,
                        });
                    }
                }
            } else if let Some(caps) = RE_SPAWNED_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
                    // Get session info
                    if let Ok(info) = crate::tmux::session::get_session_info(&session) {
                        // Parse context usage from statusline
                        let context_usage = parse_context_usage(&session);

                        spawned_sessions.push(AgentStatus {
                            name: agent_name,
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                            context_usage,
                        });
                    }
                }
            }
        }
    }

    // Add inactive core agents
    for &agent in VALID_AGENTS {
        let session_name = format!("agent-{}", agent);
        if !core_agents.iter().any(|a| a.name == agent) {
            core_agents.push(AgentStatus {
                name: agent.to_string(),
                active: false,
                session: session_name,
                attached: false,
                context_usage: None,  // No context usage when offline
            });
        }
    }

    // Sort core agents by name
    core_agents.sort_by(|a, b| a.name.cmp(&b.name));

    // Sort spawned sessions by name, then by session (which includes instance number)
    spawned_sessions.sort_by(|a, b| {
        match a.name.cmp(&b.name) {
            std::cmp::Ordering::Equal => a.session.cmp(&b.session),
            other => other,
        }
    });

    Ok(AgentStatusList {
        core: core_agents,
        spawned: spawned_sessions,
    })
}

// Data structures

#[derive(Clone, Serialize)]
pub struct AgentStatusList {
    pub core: Vec<AgentStatus>,
    pub spawned: Vec<AgentStatus>,
}

#[derive(Clone, Serialize)]
pub struct AgentStatus {
    pub name: String,
    pub active: bool,
    pub session: String,
    pub attached: bool,
    pub context_usage: Option<u8>,  // Context window usage percentage (0-100)
}

/// Launch a terminal window attached to an agent session
/// Uses gnome-terminal for all sessions
#[tauri::command]
pub async fn launch_terminal(
    session: String,
    terminal_type: String,
    title: Option<String>,
) -> Result<String, String> {
    use std::process::Command;

    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist. Spawn the agent first.", session));
    }

    // Determine title
    let window_title = title.unwrap_or_else(|| session.clone());

    // Launch gnome-terminal
    if terminal_type != "gnome-terminal" {
        return Err(format!("Invalid terminal type: '{}'. Only 'gnome-terminal' is supported.", terminal_type));
    }

    let result = Command::new("gnome-terminal")
        .arg("--title")
        .arg(&window_title)
        .arg("--")
        .arg("tmux")
        .arg("attach")
        .arg("-t")
        .arg(&session)
        .spawn();

    match result {
        Ok(_) => Ok(format!("Launched gnome-terminal for {}", session)),
        Err(e) => Err(format!("Failed to launch gnome-terminal: {}. Is gnome-terminal installed?", e))
    }
}

/// Launch terminal for a specific agent session
/// Automatically selects appropriate terminal type
/// Only opens one terminal per session - reuses existing if already open
#[tauri::command]
pub async fn open_agent_terminal(session: String) -> Result<String, String> {
    use std::process::Command;

    // Validate session
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist. Spawn the agent first.", session));
    }

    // Detach any existing clients from this session first
    // This ensures only one terminal is ever attached
    let _ = Command::new("tmux")
        .arg("detach-client")
        .arg("-s")
        .arg(&session)
        .output();

    // Generate title
    let title = format!("Agent: {}", session);

    // Use gnome-terminal for single sessions
    launch_terminal(session, "gnome-terminal".to_string(), Some(title)).await
}

/// Launch individual terminals for core team agents
#[tauri::command]
pub async fn open_core_team_terminals() -> Result<String, String> {
    use std::process::Command;

    // Verify at least some core agents are running
    let sessions = crate::tmux::session::list_sessions()?;
    let core_agents = ["agent-ana", "agent-bill", "agent-carl", "agent-enzo"];

    let mut opened = Vec::new();
    let mut errors = Vec::new();

    for session in &core_agents {
        if sessions.contains(&session.to_string()) {
            // Extract agent name for title
            let agent_name = session.strip_prefix("agent-").unwrap_or(session);
            let title = format!("Agent: {}", agent_name);

            // Launch gnome-terminal for this agent
            let result = Command::new("gnome-terminal")
                .arg("--title")
                .arg(&title)
                .arg("--")
                .arg("tmux")
                .arg("attach")
                .arg("-t")
                .arg(session)
                .spawn();

            match result {
                Ok(_) => opened.push(session.to_string()),
                Err(e) => errors.push(format!("{}: {}", session, e)),
            }
        }
    }

    if opened.is_empty() {
        return Err("No core team agents are running. Launch core team first.".to_string());
    }

    if !errors.is_empty() {
        return Err(format!("Some terminals failed to open: {}", errors.join(", ")));
    }

    Ok(format!("Opened {} core team terminals", opened.len()))
}

/// Send a command to an agent session (like /clear)
/// Sends text directly to the tmux session without waiting for confirmation
/// Uses -l flag for literal text and adds 50ms delay before C-m to prevent race conditions
#[tauri::command]
pub async fn send_agent_command(session: String, command: String) -> Result<String, String> {
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Send command text as literal keystrokes
    let output = Command::new("tmux")
        .args(&["send-keys", "-t", &session, "-l", &command])
        .output()
        .map_err(|e| format!("Failed to send command text: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to send command text to {}: {}",
            session,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Poll to ensure command text is received before sending Enter
    // This is more robust than a fixed delay
    let max_attempts = 10;
    let poll_interval = Duration::from_millis(10);

    for _ in 0..max_attempts {
        thread::sleep(poll_interval);

        // Check if pane is ready by verifying it's still responsive
        let check = Command::new("tmux")
            .args(&["list-panes", "-t", &session, "-F", "#{pane_id}"])
            .output();

        if check.is_ok() && check.unwrap().status.success() {
            // Pane is responsive, safe to send Enter
            break;
        }
    }

    // Send C-m (Enter) to submit
    // Note: Use C-m instead of "Enter" - "Enter" creates newlines in Claude Code input
    let output = Command::new("tmux")
        .args(&["send-keys", "-t", &session, "C-m"])
        .output()
        .map_err(|e| format!("Failed to send enter key: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to send enter to {}: {}",
            session,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(format!("Sent '{}' to {}", command, session))
}
