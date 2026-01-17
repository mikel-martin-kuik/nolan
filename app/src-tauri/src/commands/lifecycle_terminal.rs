//! lifecycle_terminal.rs
//!
//! Terminal launching, CLAUDE.md management, agent commands, and session recovery.
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use crate::config::TeamConfig;
use serde::Serialize;
use tauri::AppHandle;

use super::lifecycle_helpers::{validate_agent_name_format, validate_agent_session};

// === TERMINAL LAUNCHING ===

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
        return Err(format!(
            "Session '{}' does not exist. Spawn the agent first.",
            session
        ));
    }

    // Determine title
    let window_title = title.unwrap_or_else(|| session.clone());

    // Launch gnome-terminal
    if terminal_type != "gnome-terminal" {
        return Err(format!(
            "Invalid terminal type: '{}'. Only 'gnome-terminal' is supported.",
            terminal_type
        ));
    }

    // Use setsid to run in a new session, and --window to explicitly create a new window
    // This ensures the terminal process is properly detached and runs independently
    // Use = prefix for exact session matching to avoid tmux prefix matching
    let exact_session = format!("={}", session);
    let result = Command::new("setsid")
        .arg("--fork")
        .arg("gnome-terminal")
        .arg("--window")
        .arg("--title")
        .arg(&window_title)
        .arg("--")
        .arg("tmux")
        .arg("attach")
        .arg("-t")
        .arg(&exact_session)
        .spawn();

    match result {
        Ok(_) => {
            // Give terminal time to attach, then clear any window-size override
            // so the session resizes to fit the terminal (must use set-window-option, not set-option)
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let _ = Command::new("tmux")
                    .args(&["set-window-option", "-t", &exact_session, "-u", "window-size"])
                    .output();
            });
            Ok(format!("Launched gnome-terminal for {}", session))
        }
        Err(e) => Err(format!(
            "Failed to launch gnome-terminal: {}. Is gnome-terminal installed?",
            e
        )),
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
        return Err(format!(
            "Session '{}' does not exist. Spawn the agent first.",
            session
        ));
    }

    // Detach any existing clients from this session first
    // This closes existing terminal windows and prevents duplicates
    let _ = Command::new("tmux")
        .args(&["detach-client", "-s", &format!("={}", session)])
        .output();

    // Small delay to allow terminal window to close
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Generate title
    let title = format!("Agent: {}", session);

    // Use gnome-terminal for single sessions
    launch_terminal(session, "gnome-terminal".to_string(), Some(title)).await
}

/// Launch individual terminals for team agents (team-scoped)
#[tauri::command(rename_all = "snake_case")]
pub async fn open_team_terminals(team_name: String) -> Result<String, String> {
    use std::process::Command;

    // Load team config to get team agents
    let team = TeamConfig::load(&team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    // Build list of agent sessions from team config (team-scoped naming)
    let agent_sessions: Vec<String> = team
        .agent_names()
        .iter()
        .map(|agent| format!("agent-{}-{}", team_name, agent))
        .collect();

    // Verify at least some team agents are running
    let sessions = crate::tmux::session::list_sessions()?;

    let mut opened = Vec::new();
    let mut errors = Vec::new();

    for session in &agent_sessions {
        if sessions.contains(session) {
            // Detach any existing clients from this session first
            // This closes existing terminal windows and prevents duplicates
            let _ = Command::new("tmux")
                .args(&["detach-client", "-s", session])
                .output();

            // Small delay to allow terminal windows to close
            std::thread::sleep(std::time::Duration::from_millis(100));

            // Extract agent name for title from team-scoped session (agent-{team}-{name})
            let parts: Vec<&str> = session.split('-').collect();
            let agent_name = if parts.len() >= 3 {
                parts[2]
            } else {
                session.as_str()
            };
            let title = format!("Agent: {} ({})", agent_name, team_name);

            // Launch gnome-terminal for this agent
            // Use setsid to run in a new session, and --window to explicitly create a new window
            let result = Command::new("setsid")
                .arg("--fork")
                .arg("gnome-terminal")
                .arg("--window")
                .arg("--title")
                .arg(&title)
                .arg("--")
                .arg("tmux")
                .arg("attach")
                .arg("-t")
                .arg(session)
                .spawn();

            match result {
                Ok(_) => {
                    // Clear window-size override after terminal attaches (must use set-window-option)
                    let session_clone = session.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        let _ = Command::new("tmux")
                            .args(&["set-window-option", "-t", &format!("={}", session_clone), "-u", "window-size"])
                            .output();
                    });
                    opened.push(session.to_string());
                }
                Err(e) => errors.push(format!("{}: {}", session, e)),
            }
        }
    }

    if opened.is_empty() {
        return Err("No team agents are running. Launch team first.".to_string());
    }

    if !errors.is_empty() {
        return Err(format!(
            "Some terminals failed to open: {}",
            errors.join(", ")
        ));
    }

    Ok(format!("Opened {} team terminals", opened.len()))
}

// === CLAUDE.MD MANAGEMENT ===

/// Find an agent directory by name, searching both team and shared directories
/// Returns the path to the agent directory
fn find_agent_dir(agent: &str) -> Result<std::path::PathBuf, String> {
    use std::fs;

    // Check shared agents config directory first
    let shared_agent_dir = crate::utils::paths::get_agents_config_dir()?.join(agent);
    if shared_agent_dir.exists() {
        return Ok(shared_agent_dir);
    }

    // Search all team directories
    let teams_dir = crate::utils::paths::get_teams_dir()?;
    if teams_dir.exists() {
        if let Ok(entries) = fs::read_dir(&teams_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let team_path = entry.path();
                if team_path.is_dir() {
                    let team_agent_dir = team_path.join("agents").join(agent);
                    if team_agent_dir.exists() {
                        return Ok(team_agent_dir);
                    }
                }
            }
        }
    }

    Err(format!("Agent '{}' not found", agent))
}

/// Read agent's CLAUDE.md file content
/// Creates the file with a template if it doesn't exist
/// Searches both team-specific and shared agent directories
#[tauri::command]
pub async fn read_agent_claude_md(agent: String) -> Result<String, String> {
    use std::fs;

    // Validate agent name format
    validate_agent_name_format(&agent)?;

    // Find agent directory
    let agent_dir = find_agent_dir(&agent)?;
    let claude_md_path = agent_dir.join("CLAUDE.md");

    // Create file with template if it doesn't exist
    if !claude_md_path.exists() {
        let template = format!(
            "# {} Agent Instructions\n\nAdd custom instructions for this agent here.\n",
            agent.to_uppercase()
        );
        fs::write(&claude_md_path, &template)
            .map_err(|e| format!("Failed to create CLAUDE.md: {}", e))?;
        return Ok(template);
    }

    // Read file content
    fs::read_to_string(&claude_md_path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Write agent's CLAUDE.md file content
/// Searches both team-specific and shared agent directories
#[tauri::command]
pub async fn write_agent_claude_md(agent: String, content: String) -> Result<String, String> {
    use std::fs;

    // Validate agent name format
    validate_agent_name_format(&agent)?;

    // Find agent directory
    let agent_dir = find_agent_dir(&agent)?;
    let claude_md_path = agent_dir.join("CLAUDE.md");

    // Write file content
    fs::write(&claude_md_path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok(format!("Saved CLAUDE.md for {}", agent))
}

// === AGENT COMMANDS ===

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

// === SESSION RECOVERY ===

/// Response from session recovery operation
#[derive(Serialize)]
pub struct RecoverSessionsResponse {
    pub recovered: Vec<String>,
    pub errors: Vec<String>,
    pub summary: String,
}

/// Recover orphaned agent sessions after a crash
///
/// This finds agent directories that exist but have no running tmux session,
/// and restarts them with --continue to resume the Claude conversation.
///
/// Supports both Ralph ephemeral instances and team agent sessions.
#[tauri::command]
pub async fn recover_sessions(app_handle: AppHandle) -> Result<RecoverSessionsResponse, String> {
    use crate::commands::lifecycle_core::recover_all_sessions;

    let result = recover_all_sessions().await?;

    for msg in &result.recovered {
        eprintln!("Session recovery: {}", msg);
    }
    for err in &result.errors {
        eprintln!("Session recovery error: {}", err);
    }

    let summary = result.summary();

    // Emit status change event so UI updates
    super::lifecycle::emit_status_change(&app_handle).await;

    Ok(RecoverSessionsResponse {
        recovered: result.recovered,
        errors: result.errors,
        summary,
    })
}

/// List orphaned agent sessions that can be recovered
#[tauri::command]
pub async fn list_orphaned_sessions() -> Result<Vec<String>, String> {
    use crate::commands::lifecycle_core::{
        find_orphaned_ralph_instances, find_orphaned_team_sessions,
    };

    let mut sessions = Vec::new();

    // Ralph instances
    let ralph_orphaned = find_orphaned_ralph_instances()?;
    sessions.extend(ralph_orphaned.into_iter().map(|i| i.session));

    // Team sessions
    let team_orphaned = find_orphaned_team_sessions()?;
    sessions.extend(team_orphaned.into_iter().map(|s| s.session));

    Ok(sessions)
}

/// List all git worktrees for Ralph to work in
#[tauri::command]
pub async fn list_worktrees() -> Result<Vec<crate::git::worktree::WorktreeListEntry>, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    crate::git::worktree::list_worktrees(&nolan_root)
}

/// Create a new worktree for Ralph to work in
/// Returns the path and branch name of the created worktree
#[tauri::command(rename_all = "snake_case")]
pub async fn create_worktree_for_ralph(
    label: Option<String>,
) -> Result<serde_json::Value, String> {
    use uuid::Uuid;

    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let worktrees_dir = crate::git::worktree::get_worktrees_dir()?;

    // Generate a unique run ID
    let uuid_suffix = Uuid::new_v4().to_string()[..7].to_string();
    let run_id = if let Some(ref lbl) = label {
        // Sanitize label: lowercase, replace spaces/special chars with hyphens, truncate
        let sanitized = lbl
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .to_string();
        let truncated = if sanitized.len() > 30 {
            &sanitized[..30]
        } else {
            &sanitized
        };
        format!("{}-{}", truncated.trim_end_matches('-'), uuid_suffix)
    } else {
        // Use timestamp format
        let timestamp = chrono::Utc::now().format("%H%M%S").to_string();
        format!("{}-{}", timestamp, uuid_suffix)
    };

    // Create worktree path: ~/.nolan/worktrees/ralph/{run_id}
    let worktree_path = worktrees_dir.join("ralph").join(&run_id);

    // Generate branch name
    let branch_name = crate::git::worktree::generate_branch_name("ralph", &run_id);

    // Create the worktree
    let _base_commit = crate::git::worktree::create_worktree(
        &nolan_root,
        &worktree_path,
        &branch_name,
        Some("main"), // Base from main branch
    )?;

    Ok(serde_json::json!({
        "path": worktree_path.to_string_lossy(),
        "branch": branch_name,
        "run_id": run_id
    }))
}

/// Remove a git worktree
#[tauri::command(rename_all = "snake_case")]
pub async fn remove_worktree(path: String) -> Result<(), String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let worktree_path = std::path::PathBuf::from(&path);

    // Verify the path is under the worktrees directory for safety
    let worktrees_dir = crate::git::worktree::get_worktrees_dir()?;
    if !worktree_path.starts_with(&worktrees_dir) {
        return Err(format!(
            "Cannot remove worktree outside of worktrees directory: {}",
            path
        ));
    }

    crate::git::worktree::remove_worktree(&nolan_root, &worktree_path, true)
}
