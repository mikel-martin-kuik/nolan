//! lifecycle_ralph.rs
//!
//! Ralph (free agent) lifecycle operations: spawn and kill.
//! Ralph is a team-independent agent that can be spawned multiple times.
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use crate::constants::parse_ralph_session;
use tauri::AppHandle;

use super::lifecycle_helpers::{
    count_running_instances, find_available_ralph_name, get_agent_cli_provider, get_default_model,
    register_session, validate_agent_session, MAX_INSTANCES,
};

/// Mutex to prevent race conditions when spawning Ralph agents
/// Ensures atomic name selection and session creation
pub static RALPH_SPAWN_LOCK: once_cell::sync::Lazy<tokio::sync::Mutex<()>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(()));

/// Spawn a new free agent instance (Ralph only)
/// Team agents have a single session each - use start_agent instead
///
/// # Arguments
/// * `worktree_path` - Optional path to an existing worktree to work in.
///   Ralph will work on pre-existing worktrees, not create new ones.
#[tauri::command(rename_all = "snake_case")]
pub async fn spawn_agent(
    app_handle: AppHandle,
    _team_name: String,
    agent: String,
    force: bool,
    model: Option<String>,
    chrome: Option<bool>,
    worktree_path: Option<String>,
) -> Result<String, String> {
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::symlink;
    use std::process::Command;

    // Only Ralph can be spawned as a free agent
    // Team agents have exactly one session per team - use start_agent instead
    if agent != "ralph" {
        return Err(format!(
            "Cannot spawn '{}' - team agents have a single session per team. Use start_agent to start a team agent.",
            agent
        ));
    }

    // Validate model if provided
    if let Some(ref m) = model {
        if !["opus", "sonnet", "haiku"].contains(&m.as_str()) {
            return Err(format!(
                "Invalid model: '{}'. Valid models: opus, sonnet, haiku",
                m
            ));
        }
    }

    // Count running Ralph instances (team-independent)
    let running = count_running_instances("", &agent)?;

    // Check instance limit (unless --force)
    if running >= MAX_INSTANCES as usize && !force {
        return Err(format!(
            "Max instances ({}) reached for ralph ({} currently running). Use force to override.",
            MAX_INSTANCES, running
        ));
    }

    // Acquire lock to prevent race conditions in name selection and session creation
    // This ensures atomic operation from name selection to tmux session creation
    let _spawn_guard = RALPH_SPAWN_LOCK.lock().await;

    // Find available name from RALPH_NAMES pool (ziggy, nova, etc.)
    let instance_id = find_available_ralph_name()?;

    // Create ephemeral agent directory: /agents/instances/agent-ralph-{name}/ (matches session name)
    let instances_dir = crate::utils::paths::get_agents_instances_dir()?;
    let agent_dir = instances_dir.join(format!("agent-ralph-{}", instance_id));

    // Config directory for base agent templates
    let config_dir = crate::utils::paths::get_agents_config_dir()?;

    // Session naming: agent-ralph-{name}
    let session = format!("agent-ralph-{}", instance_id);

    // Check if this session already exists (shouldn't happen with lock, but safety check)
    if crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' already exists", session));
    }

    // Get paths using utility functions
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Create ephemeral agent directory structure
    if !agent_dir.exists() {
        fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create agent directory: {}", e))?;

        // Create symlink to .claude so Claude Code loads settings
        // For Ralph, use ralph-specific settings (no team hooks) from agents/config/free/ralph/.claude
        #[cfg(unix)]
        {
            let base_agent_dir = config_dir.join("free").join(&agent);
            let ralph_claude = base_agent_dir.join(".claude");

            if ralph_claude.exists() {
                let claude_link = agent_dir.join(".claude");
                if !claude_link.exists() && !claude_link.is_symlink() {
                    if let Err(e) = symlink(&ralph_claude, &claude_link) {
                        eprintln!("Warning: Failed to create .claude symlink: {}", e);
                    }
                }
            }
        }

        // Create symlink to CLAUDE.md for agent instructions
        #[cfg(unix)]
        {
            let base_agent_dir = config_dir.join("free").join(&agent);
            let claude_md_src = base_agent_dir.join("CLAUDE.md");
            if claude_md_src.exists() {
                let claude_md_link = agent_dir.join("CLAUDE.md");
                if !claude_md_link.exists() {
                    if let Err(e) = symlink(&claude_md_src, &claude_md_link) {
                        eprintln!("Warning: Failed to create CLAUDE.md symlink: {}", e);
                    }
                }
            }
        }
    }

    // Convert paths to strings for command
    let nolan_root_str = nolan_root.to_string_lossy();
    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let nolan_data_root_str = nolan_data_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let agent_dir_str = agent_dir.to_string_lossy();

    // Worktree support: use existing worktree path for file changes
    // Ralph works on pre-existing worktrees, not new ones
    let (working_dir, worktree_path_str, worktree_branch) = if let Some(ref wt_path) = worktree_path
    {
        let worktree_path = std::path::PathBuf::from(wt_path);

        // Verify the worktree path exists
        if !worktree_path.exists() {
            return Err(format!("Worktree path does not exist: {}", wt_path));
        }

        // Detect the branch name from the worktree (if it's a git worktree)
        let branch_name = if worktree_path.join(".git").exists() {
            // Try to get the current branch
            let output = Command::new("git")
                .args(["-C", wt_path, "rev-parse", "--abbrev-ref", "HEAD"])
                .output();
            match output {
                Ok(out) if out.status.success() => {
                    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                }
                _ => None,
            }
        } else {
            None
        };

        // Copy CLAUDE.md into worktree so agent has instructions
        #[cfg(unix)]
        {
            let base_agent_dir = config_dir.join("free").join(&agent);
            let claude_md_src = base_agent_dir.join("CLAUDE.md");
            if claude_md_src.exists() {
                let claude_md_link = worktree_path.join("CLAUDE.md");
                if !claude_md_link.exists() {
                    // Copy the file content (symlinks don't work well in worktrees)
                    if let Ok(content) = std::fs::read_to_string(&claude_md_src) {
                        let _ = std::fs::write(&claude_md_link, content);
                    }
                }
            }

            // Copy .claude settings into worktree (includes statusline config)
            let ralph_claude = base_agent_dir.join(".claude");
            if ralph_claude.exists() {
                let claude_dest = worktree_path.join(".claude");
                if !claude_dest.exists() {
                    // Use cp -r for directory copy
                    let cp_result = Command::new("cp")
                        .args([
                            "-r",
                            &ralph_claude.to_string_lossy(),
                            &claude_dest.to_string_lossy(),
                        ])
                        .output();

                    // Log if copy failed (helps debug statusline issues)
                    match cp_result {
                        Ok(output) if !output.status.success() => {
                            eprintln!(
                                "Warning: Failed to copy .claude settings to worktree: {}",
                                String::from_utf8_lossy(&output.stderr)
                            );
                        }
                        Err(e) => {
                            eprintln!(
                                "Warning: Failed to copy .claude settings to worktree: {}",
                                e
                            );
                        }
                        Ok(_) => {
                            // Verify the copy succeeded
                            if !claude_dest.exists() {
                                eprintln!(
                                    "Warning: .claude directory not found after copy to worktree"
                                );
                            }
                        }
                    }
                }
            } else {
                eprintln!(
                    "Warning: ralph .claude directory not found at {:?}",
                    ralph_claude
                );
            }
        }

        (worktree_path, Some(wt_path.clone()), branch_name)
    } else {
        (agent_dir.clone(), None, None)
    };
    let working_dir_str = working_dir.to_string_lossy();

    // Use provided model or default for Ralph
    let model_str = model.unwrap_or_else(|| get_default_model(&agent));

    // Get CLI provider for Ralph
    let cli_provider_name = get_agent_cli_provider(&agent, None);
    let cli_provider = crate::cli_providers::get_provider(cli_provider_name.as_deref(), true);
    let mapped_model = cli_provider.map_model(&model_str);

    // Add --chrome flag if requested (enables Chrome DevTools integration)
    let chrome_flag = if chrome.unwrap_or(false) {
        " --chrome"
    } else {
        ""
    };

    // Build worktree env vars if applicable (including REPO_PATH for merge agents)
    let (worktree_env, repo_path_str) =
        if let (Some(ref wt_path), Some(ref wt_branch)) = (&worktree_path_str, &worktree_branch) {
            // Detect the main repository path from the worktree
            // git worktree list returns the main repo as the first entry
            let repo_path = Command::new("git")
                .args(["-C", wt_path, "worktree", "list"])
                .output()
                .ok()
                .and_then(|output| {
                    if output.status.success() {
                        String::from_utf8_lossy(&output.stdout)
                            .lines()
                            .next()
                            .and_then(|line| line.split_whitespace().next())
                            .map(String::from)
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| nolan_root.to_string_lossy().to_string());

            (
                format!(
                    " WORKTREE_PATH=\"{}\" WORKTREE_BRANCH=\"{}\" REPO_PATH=\"{}\"",
                    wt_path, wt_branch, repo_path
                ),
                Some(repo_path),
            )
        } else {
            (String::new(), None)
        };

    // Create tmux session for Ralph (team-independent, TEAM_NAME is empty)
    // If worktree is enabled, run from worktree directory for isolated file changes
    let cmd = format!(
        "export AGENT_NAME={} TEAM_NAME=\"\" NOLAN_ROOT=\"{}\" NOLAN_DATA_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\"{worktree_env}; {} --dangerously-skip-permissions --model {}{}; sleep 0.5; tmux kill-session",
        agent, nolan_root_str, nolan_data_root_str, projects_dir_str, agent_dir_str, cli_provider.executable(), mapped_model, chrome_flag
    );

    let output = Command::new("tmux")
        .args(&[
            "new-session",
            "-d",
            "-s",
            &session,
            "-c",
            working_dir_str.as_ref(),
            &cmd,
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    // Set tmux session environment variables so they're available to all processes (including hooks)
    // This supplements the shell export and ensures hooks can access AGENT_DIR
    let mut env_vars: Vec<(&str, &str)> = vec![
        ("AGENT_NAME", agent.as_str()),
        ("TEAM_NAME", ""),
        ("NOLAN_ROOT", nolan_root_str.as_ref()),
        ("NOLAN_DATA_ROOT", nolan_data_root_str.as_ref()),
        ("PROJECTS_DIR", projects_dir_str.as_ref()),
        ("AGENT_DIR", agent_dir_str.as_ref()),
    ];

    // Add worktree env vars if applicable (including REPO_PATH)
    // Need to own the strings so they live long enough for the env_vars references
    let wt_path_owned = worktree_path_str.clone().unwrap_or_default();
    let wt_branch_owned = worktree_branch.clone().unwrap_or_default();
    let repo_path_owned = repo_path_str.clone().unwrap_or_default();
    if let (Some(_), Some(_)) = (&worktree_path_str, &worktree_branch) {
        env_vars.push(("WORKTREE_PATH", &wt_path_owned));
        env_vars.push(("WORKTREE_BRANCH", &wt_branch_owned));
        if repo_path_str.is_some() {
            env_vars.push(("REPO_PATH", &repo_path_owned));
        }
    }
    for (key, value) in &env_vars {
        let _ = Command::new("tmux")
            .args(&["set-environment", "-t", &session, key, value])
            .output();
    }

    if !output.status.success() {
        return Err(format!(
            "Failed to spawn ralph session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    // Lock is automatically released here when _spawn_guard goes out of scope

    // Register session in the registry for history lookup (non-fatal)
    if let Err(e) = register_session(&session, &agent, agent_dir_str.as_ref(), "") {
        eprintln!("Warning: Failed to register session {}: {}", session, e);
    }

    // Emit status change event after successful spawn
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        super::lifecycle::emit_status_change(&app_clone).await;
    });

    Ok(format!("Spawned: {}", session))
}

/// Kill a specific agent instance
#[tauri::command]
pub async fn kill_instance(app_handle: AppHandle, session: String) -> Result<String, String> {
    use std::fs;

    // SECURITY: Validate session name before killing
    validate_agent_session(&session)?;

    // Track whether session existed for response message
    let session_existed = crate::tmux::session::session_exists(&session)?;

    // Kill the session if it exists
    if session_existed {
        crate::tmux::session::kill_session(&session)?;
        // Clean up any custom session label
        crate::commands::session_labels::on_session_killed(&session);
    }

    // For ephemeral Ralph agents, ALWAYS delete the agent directory (agent-ralph-{name})
    // This runs regardless of session existence to handle orphaned directories
    // Uses centralized parse_ralph_session for consistent validation
    let mut dir_deleted = false;
    if let Some(instance_id) = parse_ralph_session(&session) {
        // This is an ephemeral agent, delete its directory from instances/
        let instances_dir =
            crate::utils::paths::get_agents_instances_dir().unwrap_or_else(|_| std::path::PathBuf::new());
        let agent_path = instances_dir.join(format!("agent-ralph-{}", instance_id));

        if agent_path.exists() {
            if let Err(e) = fs::remove_dir_all(&agent_path) {
                eprintln!("Warning: Failed to delete ephemeral agent directory: {}", e);
            } else {
                dir_deleted = true;
            }
        }
    }

    // If session didn't exist and no directory was deleted, return error
    if !session_existed && !dir_deleted {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Emit status change event after successful kill/cleanup
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        super::lifecycle::emit_status_change(&app_clone).await;
    });

    if session_existed {
        Ok(format!("Killed session: {}", session))
    } else {
        Ok(format!("Cleaned up orphaned directory for: {}", session))
    }
}

/// Kill all Ralph instances (free agents)
/// Team agents have exactly one session - use kill_instance instead
#[tauri::command(rename_all = "snake_case")]
pub async fn kill_all_instances(
    app_handle: AppHandle,
    _team_name: String,
    agent: String,
) -> Result<String, String> {
    use std::fs;

    // Only Ralph can have multiple instances
    if agent != "ralph" {
        return Err(format!(
            "Cannot kill all instances of '{}' - team agents have a single session. Use kill_instance instead.",
            agent
        ));
    }

    let sessions = crate::tmux::session::list_sessions()?;
    let mut killed: Vec<String> = Vec::new();
    let mut cleaned: Vec<String> = Vec::new();

    // Get instances directory once
    let instances_dir =
        crate::utils::paths::get_agents_instances_dir().unwrap_or_else(|_| std::path::PathBuf::new());

    // Find all Ralph instances: agent-ralph-{name}
    // Uses centralized parse_ralph_session for consistent validation
    for session in &sessions {
        if let Some(instance_id) = parse_ralph_session(session) {
            if crate::tmux::session::kill_session(session).is_ok() {
                // Only delete ephemeral agent directories (where .claude is a symlink)
                // Pre-defined agents like agent-ralph-debug have a real .claude directory
                let agent_path = instances_dir.join(format!("agent-ralph-{}", instance_id));
                let claude_path = agent_path.join(".claude");
                if agent_path.exists() && claude_path.is_symlink() {
                    let _ = fs::remove_dir_all(&agent_path);
                }
                killed.push(session.to_string());
            }
        }
    }

    // Clean up all Ralph session labels
    crate::commands::session_labels::clear_all_ralph_labels();

    // Also clean up orphaned ephemeral directories (no running session)
    // These can occur if the session crashed or was killed externally
    // Only delete directories where .claude is a symlink (ephemeral, not pre-defined)
    if instances_dir.exists() {
        if let Ok(entries) = fs::read_dir(&instances_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("agent-ralph-") {
                    // Check if there's a running session for this directory
                    if !sessions.contains(&name) {
                        // Only delete ephemeral directories (where .claude is a symlink)
                        let claude_path = entry.path().join(".claude");
                        if claude_path.is_symlink() {
                            if let Err(e) = fs::remove_dir_all(entry.path()) {
                                eprintln!(
                                    "Warning: Failed to delete orphaned directory {}: {}",
                                    name, e
                                );
                            } else {
                                cleaned.push(name);
                            }
                        }
                    }
                }
            }
        }
    }

    // Emit status change event if any sessions were killed or directories cleaned
    if !killed.is_empty() || !cleaned.is_empty() {
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            super::lifecycle::emit_status_change(&app_clone).await;
        });
    }

    // Build response message
    let mut messages: Vec<String> = Vec::new();
    if !killed.is_empty() {
        messages.push(format!(
            "Killed {} ralph instances: {}",
            killed.len(),
            killed.join(", ")
        ));
    }
    if !cleaned.is_empty() {
        messages.push(format!(
            "Cleaned {} orphaned directories: {}",
            cleaned.len(),
            cleaned.join(", ")
        ));
    }

    if messages.is_empty() {
        Ok("No ralph instances or orphaned directories found".to_string())
    } else {
        Ok(messages.join(". "))
    }
}
