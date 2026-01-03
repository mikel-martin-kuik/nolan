use regex::Regex;
use serde::Serialize;

// Protected infrastructure sessions that should never be killed
const PROTECTED_SESSIONS: &[&str] = &["communicator", "history-log", "lifecycle"];

// Valid agent names
const VALID_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo", "ralph"];

/// Validates that a session name is a valid agent session
fn validate_agent_session(session: &str) -> Result<(), String> {
    // Must match: agent-{name} or agent-{name}{2-5}
    // Examples: agent-ana, agent-bill2, agent-carl3
    let re = Regex::new(r"^agent-([a-z]+)([2-5])?$").unwrap();

    let Some(caps) = re.captures(session) else {
        return Err(format!(
            "Invalid session name format: '{}'. Expected: agent-{{name}}[{{2-5}}]",
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
pub async fn launch_core() -> Result<String, String> {
    crate::commands::execute_script("launch-core.sh".to_string(), vec![]).await
}

/// Kill all core team agents (requires user confirmation in frontend)
#[tauri::command]
pub async fn kill_core() -> Result<String, String> {
    crate::commands::execute_script("kill-core.sh".to_string(), vec![]).await
}

/// Spawn a new agent instance
#[tauri::command]
pub async fn spawn_agent(agent: String, force: bool) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent)?;

    // Build args: spawn-agent.sh expects "spawn <agent> [--force]"
    let mut args = vec!["spawn".to_string(), agent];
    if force {
        args.push("--force".to_string());
    }

    // Execute spawn-agent.sh
    crate::commands::execute_script("spawn-agent.sh".to_string(), args).await
}

/// Kill a specific agent instance
#[tauri::command]
pub async fn kill_instance(session: String) -> Result<String, String> {
    // SECURITY: Validate session name before killing
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Kill the session
    crate::tmux::session::kill_session(&session)?;

    Ok(format!("Killed session: {}", session))
}

/// Kill all spawned instances of an agent
#[tauri::command]
pub async fn kill_all_instances(agent: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent)?;

    // Find all spawned instances: agent-{name}2, agent-{name}3, etc.
    let sessions = crate::tmux::session::list_sessions()?;
    let pattern = format!("^agent-{}[2-5]$", agent);
    let re = Regex::new(&pattern).unwrap();

    let mut killed = Vec::new();
    for session in sessions {
        if re.is_match(&session) {
            if crate::tmux::session::kill_session(&session).is_ok() {
                killed.push(session);
            }
        }
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
            let re_core = Regex::new(r"^agent-([a-z]+)$").unwrap();
            let re_spawned = Regex::new(r"^agent-([a-z]+)[2-5]$").unwrap();

            if let Some(caps) = re_core.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
                    // Get session info
                    if let Ok(info) = crate::tmux::session::get_session_info(&session) {
                        core_agents.push(AgentStatus {
                            name: agent_name,
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                        });
                    }
                }
            } else if re_spawned.is_match(&session) {
                spawned_sessions.push(session);
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
            });
        }
    }

    // Sort core agents by name
    core_agents.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(AgentStatusList {
        core: core_agents,
        spawned: spawned_sessions,
    })
}

// Data structures

#[derive(Serialize)]
pub struct AgentStatusList {
    pub core: Vec<AgentStatus>,
    pub spawned: Vec<String>,
}

#[derive(Serialize)]
pub struct AgentStatus {
    pub name: String,
    pub active: bool,
    pub session: String,
    pub attached: bool,
}

/// Launch a terminal window attached to an agent session
/// Supports both gnome-terminal (single sessions) and terminator (grid layout)
#[tauri::command]
pub async fn launch_terminal(
    session: String,
    terminal_type: String,
    title: Option<String>,
) -> Result<String, String> {
    use std::process::Command;

    // Validate session name (unless it's "team" for terminator grid)
    if session != "team" {
        validate_agent_session(&session)?;

        // Verify session exists
        if !crate::tmux::session::session_exists(&session)? {
            return Err(format!("Session '{}' does not exist. Spawn the agent first.", session));
        }
    }

    // Determine title
    let window_title = title.unwrap_or_else(|| session.clone());

    // Launch appropriate terminal emulator
    match terminal_type.as_str() {
        "gnome-terminal" => {
            // Used for: spawned instances, Dan standalone
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
        "terminator" => {
            // Used for: core team grid (Ana, Bill, Carl, Enzo)
            // Note: Requires terminator layout configuration named "team"
            let result = Command::new("terminator")
                .arg("--maximize")
                .arg("--layout=team")
                .spawn();

            match result {
                Ok(_) => Ok("Launched terminator grid for core team".to_string()),
                Err(e) => Err(format!("Failed to launch terminator: {}. Is terminator installed with 'team' layout configured?", e))
            }
        }
        _ => Err(format!("Invalid terminal type: '{}'. Supported: gnome-terminal, terminator", terminal_type))
    }
}

/// Launch terminal for a specific agent session
/// Automatically selects appropriate terminal type
#[tauri::command]
pub async fn open_agent_terminal(session: String) -> Result<String, String> {
    // Validate session
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist. Spawn the agent first.", session));
    }

    // Generate title
    let title = format!("Agent: {}", session);

    // Use gnome-terminal for single sessions
    launch_terminal(session, "gnome-terminal".to_string(), Some(title)).await
}

/// Launch core team grid in terminator
#[tauri::command]
pub async fn open_core_team_terminals() -> Result<String, String> {
    // Verify at least some core agents are running
    let sessions = crate::tmux::session::list_sessions()?;
    let core_sessions: Vec<_> = sessions
        .iter()
        .filter(|s| {
            matches!(
                s.as_str(),
                "agent-ana" | "agent-bill" | "agent-carl" | "agent-enzo"
            )
        })
        .collect();

    if core_sessions.is_empty() {
        return Err("No core team agents are running. Launch core team first.".to_string());
    }

    // Launch terminator with team layout
    launch_terminal("team".to_string(), "terminator".to_string(), None).await
}
