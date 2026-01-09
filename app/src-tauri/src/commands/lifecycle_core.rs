//! Core lifecycle functions that don't depend on AppHandle
//!
//! These functions contain the business logic without event emission,
//! allowing them to be used from both Tauri commands and HTTP handlers.

use std::process::Command;
use crate::config::TeamConfig;
use crate::tmux::session;

/// Kill a tmux session
pub fn kill_session(session_name: &str) -> Result<String, String> {
    if !session::session_exists(session_name)? {
        return Err(format!("Session '{}' does not exist", session_name));
    }

    let output = Command::new("tmux")
        .args(&["kill-session", "-t", session_name])
        .output()
        .map_err(|e| format!("Failed to kill session: {}", e))?;

    if output.status.success() {
        Ok(format!("Killed session: {}", session_name))
    } else {
        Err(format!(
            "Failed to kill session: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Kill all sessions for a team
pub fn kill_team_sessions(team_name: &str) -> Result<String, String> {
    let team = TeamConfig::load(team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    let mut killed = Vec::new();
    let mut errors = Vec::new();

    for agent in team.workflow_participants() {
        let session = format!("agent-{}-{}", team_name, agent);
        if session::session_exists(&session).unwrap_or(false) {
            match kill_session(&session) {
                Ok(_) => killed.push(session),
                Err(e) => errors.push(format!("{}: {}", session, e)),
            }
        }
    }

    if !errors.is_empty() {
        Err(format!("Errors: {:?}", errors))
    } else if killed.is_empty() {
        Ok("No sessions to kill".to_string())
    } else {
        Ok(format!("Killed {} sessions: {:?}", killed.len(), killed))
    }
}

/// Start a team agent session (without auto-start terminal stream)
pub async fn start_agent_core(team_name: &str, agent: &str) -> Result<String, String> {
    // Load team config
    let team = TeamConfig::load(team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    // Validate agent is in team (can be workflow participant or coordinator)
    let participants = team.workflow_participants();
    let is_participant = participants.iter().any(|p| p == &agent);
    let is_coordinator = team.coordinator() == agent;

    if !is_participant && !is_coordinator {
        return Err(format!(
            "Agent '{}' is not a participant or coordinator in team '{}'",
            agent, team_name
        ));
    }

    // Build session name
    let session = format!("agent-{}-{}", team_name, agent);

    // Check if already running
    if session::session_exists(&session)? {
        return Err(format!("Session '{}' already exists", session));
    }

    // Get paths
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let agent_dir = agents_dir.join(agent);

    if !agent_dir.exists() {
        return Err(format!("Agent directory not found: {:?}", agent_dir));
    }

    // Get model for agent
    let model = crate::commands::lifecycle::get_default_model(agent);

    // Build Claude command
    let cmd = format!(
        "export AGENT_NAME={} TEAM_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
        agent,
        team_name,
        nolan_root.to_string_lossy(),
        projects_dir.to_string_lossy(),
        model
    );

    // Create tmux session
    let output = Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &session,
            "-c", &agent_dir.to_string_lossy(),
            &cmd
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to start agent: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session
    if let Err(e) = crate::commands::lifecycle::register_session(
        &session,
        agent,
        &agent_dir.to_string_lossy(),
        team_name,
    ) {
        eprintln!("Warning: Failed to register session: {}", e);
    }

    Ok(format!("Started: {}", session))
}

/// Spawn a Ralph instance (without auto-start terminal stream)
pub async fn spawn_ralph_core(model: Option<String>, force: bool) -> Result<String, String> {
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    const MAX_INSTANCES: usize = 3;

    // Validate model if provided
    if let Some(ref m) = model {
        if !["opus", "sonnet", "haiku"].contains(&m.as_str()) {
            return Err(format!(
                "Invalid model: '{}'. Valid models: opus, sonnet, haiku",
                m
            ));
        }
    }

    // Count running Ralph instances
    let running = crate::commands::lifecycle::count_running_instances("", "ralph")?;

    if running >= MAX_INSTANCES && !force {
        return Err(format!(
            "Max instances ({}) reached for ralph ({} currently running). Use force to override.",
            MAX_INSTANCES, running
        ));
    }

    // Find available name
    let instance_id = crate::commands::lifecycle::find_available_ralph_name()?;
    let session = format!("agent-ralph-{}", instance_id);

    // Check if exists
    if session::session_exists(&session)? {
        return Err(format!("Session '{}' already exists", session));
    }

    // Get paths
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let agent_dir = agents_dir.join(format!("agent-ralph-{}", instance_id));

    // Create ephemeral directory
    if !agent_dir.exists() {
        fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create agent directory: {}", e))?;

        // Create symlinks
        #[cfg(unix)]
        {
            // .claude symlink
            if let Ok(app_root) = crate::utils::paths::get_nolan_app_root() {
                let claude_path = app_root.join(".claude");
                if claude_path.exists() {
                    let claude_link = agent_dir.join(".claude");
                    let _ = symlink(&claude_path, &claude_link);
                }
            }

            // CLAUDE.md symlink
            let base_agent_dir = agents_dir.join("ralph");
            let claude_md_src = base_agent_dir.join("CLAUDE.md");
            if claude_md_src.exists() {
                let claude_md_link = agent_dir.join("CLAUDE.md");
                let _ = symlink(&claude_md_src, &claude_md_link);
            }
        }
    }

    // Build command
    let model_str = model.unwrap_or_else(|| crate::commands::lifecycle::get_default_model("ralph"));
    let cmd = format!(
        "export AGENT_NAME=ralph TEAM_NAME=\"\" NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
        nolan_root.to_string_lossy(),
        projects_dir.to_string_lossy(),
        model_str
    );

    // Create session
    let output = Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &session,
            "-c", &agent_dir.to_string_lossy(),
            &cmd
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to spawn ralph: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session
    if let Err(e) = crate::commands::lifecycle::register_session(
        &session,
        "ralph",
        &agent_dir.to_string_lossy(),
        "",
    ) {
        eprintln!("Warning: Failed to register session: {}", e);
    }

    Ok(format!("Spawned: {}", session))
}
