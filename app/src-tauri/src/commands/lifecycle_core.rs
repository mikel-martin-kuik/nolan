//! Core lifecycle functions that don't depend on AppHandle
//!
//! These functions contain the business logic without event emission,
//! allowing them to be used from both Tauri commands and HTTP handlers.

use std::process::Command;
use std::path::PathBuf;
use crate::config::TeamConfig;
use crate::tmux::session;
use crate::constants::RALPH_NAMES;

/// Kill a tmux session and clean up ephemeral directory for Ralph instances
pub fn kill_session(session_name: &str) -> Result<String, String> {
    use std::fs;
    use crate::constants::parse_ralph_session;

    // Track whether session existed for response message
    let session_existed = session::session_exists(session_name)?;

    // Kill the session if it exists
    if session_existed {
        let output = Command::new("tmux")
            .args(&["kill-session", "-t", session_name])
            .output()
            .map_err(|e| format!("Failed to kill session: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to kill session: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    // For ephemeral Ralph agents, ALWAYS delete the agent directory (agent-ralph-{name})
    // This runs regardless of session existence to handle orphaned directories
    let mut dir_deleted = false;
    if let Some(instance_id) = parse_ralph_session(session_name) {
        if let Ok(agents_dir) = crate::utils::paths::get_agents_dir() {
            let agent_path = agents_dir.join(format!("agent-ralph-{}", instance_id));
            if agent_path.exists() {
                if let Err(e) = fs::remove_dir_all(&agent_path) {
                    eprintln!("Warning: Failed to delete ephemeral agent directory: {}", e);
                } else {
                    dir_deleted = true;
                }
            }
        }
    }

    // If session didn't exist and no directory was deleted, return error
    if !session_existed && !dir_deleted {
        return Err(format!("Session '{}' does not exist", session_name));
    }

    if session_existed {
        Ok(format!("Killed session: {}", session_name))
    } else {
        Ok(format!("Cleaned up orphaned directory for: {}", session_name))
    }
}

/// Clear the active project file for a team
/// This prevents stale recovery when the team is intentionally killed
pub fn clear_team_active_project(team_name: &str) -> Result<(), String> {
    use std::fs;

    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set")?;

    let state_file = PathBuf::from(&nolan_root)
        .join(".state")
        .join(team_name)
        .join("active-project.txt");

    if state_file.exists() {
        fs::remove_file(&state_file)
            .map_err(|e| format!("Failed to clear active project: {}", e))?;
    }

    Ok(())
}

/// Kill all sessions for a team
pub fn kill_team_sessions(team_name: &str) -> Result<String, String> {
    let team = TeamConfig::load(team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    let mut killed = Vec::new();
    let mut errors = Vec::new();

    // Use agent_names() to include ALL agents (including coordinator)
    // not just workflow_participants
    for agent in team.agent_names() {
        let session = format!("agent-{}-{}", team_name, agent);
        if session::session_exists(&session).unwrap_or(false) {
            match kill_session(&session) {
                Ok(_) => killed.push(session),
                Err(e) => errors.push(format!("{}: {}", session, e)),
            }
        }
    }

    // Clear active project to prevent stale recovery
    if let Err(e) = clear_team_active_project(team_name) {
        eprintln!("Warning: Failed to clear active project for team '{}': {}", team_name, e);
        // Non-fatal - sessions are still killed
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

    const MAX_INSTANCES: usize = 15;

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

/// Information about an orphaned Ralph instance that can be recovered
#[derive(Debug, Clone)]
pub struct OrphanedRalphInstance {
    /// The instance name (e.g., "ziggy", "nova")
    pub name: String,
    /// The full session name (e.g., "agent-ralph-ziggy")
    pub session: String,
    /// Path to the ephemeral directory
    pub agent_dir: PathBuf,
}

/// Find orphaned Ralph instances - directories that exist but have no running tmux session
/// These can be recovered with --continue to resume the Claude conversation
pub fn find_orphaned_ralph_instances() -> Result<Vec<OrphanedRalphInstance>, String> {
    use std::fs;

    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let mut orphaned = Vec::new();

    // Get all running tmux sessions
    let running_sessions = session::list_sessions().unwrap_or_default();

    // Check each Ralph name for orphaned directories
    for name in RALPH_NAMES.iter() {
        let dir_name = format!("agent-ralph-{}", name);
        let agent_dir = agents_dir.join(&dir_name);
        let session_name = format!("agent-ralph-{}", name);

        // Directory exists but session is not running
        if agent_dir.exists() && !running_sessions.contains(&session_name) {
            // Verify it's actually a Ralph ephemeral directory (has .claude symlink)
            let claude_link = agent_dir.join(".claude");
            if claude_link.exists() || claude_link.is_symlink() {
                orphaned.push(OrphanedRalphInstance {
                    name: name.to_string(),
                    session: session_name,
                    agent_dir,
                });
            }
        }
    }

    // Also check for any custom-named ralph directories (random alphanumeric fallback)
    if let Ok(entries) = fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if dir_name.starts_with("agent-ralph-") {
                // Extract the instance name
                let name = dir_name.strip_prefix("agent-ralph-").unwrap_or("");
                // Skip if it's in RALPH_NAMES (already checked above)
                if RALPH_NAMES.contains(&name) {
                    continue;
                }

                let session_name = dir_name.clone();
                let agent_dir = entry.path();

                if agent_dir.is_dir() && !running_sessions.contains(&session_name) {
                    let claude_link = agent_dir.join(".claude");
                    if claude_link.exists() || claude_link.is_symlink() {
                        orphaned.push(OrphanedRalphInstance {
                            name: name.to_string(),
                            session: session_name,
                            agent_dir,
                        });
                    }
                }
            }
        }
    }

    Ok(orphaned)
}

/// Recover a Ralph instance by restarting its tmux session with --continue
/// This resumes the Claude conversation from where it left off
pub async fn recover_ralph_instance(instance: &OrphanedRalphInstance, model: Option<String>) -> Result<String, String> {
    // Check if session already exists (safety check)
    if session::session_exists(&instance.session)? {
        return Err(format!("Session '{}' already exists", instance.session));
    }

    // Get paths
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Build command with --continue flag to resume the previous Claude session
    let model_str = model.unwrap_or_else(|| crate::commands::lifecycle::get_default_model("ralph"));
    let cmd = format!(
        "export AGENT_NAME=ralph TEAM_NAME=\"\" NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\"; claude --dangerously-skip-permissions --model {} --continue; exec bash",
        nolan_root.to_string_lossy(),
        projects_dir.to_string_lossy(),
        model_str
    );

    // Create session
    let output = Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &instance.session,
            "-c", &instance.agent_dir.to_string_lossy(),
            &cmd
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to recover ralph instance: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session
    if let Err(e) = crate::commands::lifecycle::register_session(
        &instance.session,
        "ralph",
        &instance.agent_dir.to_string_lossy(),
        "",
    ) {
        eprintln!("Warning: Failed to register recovered session: {}", e);
    }

    Ok(format!("Recovered: {} (resumed Claude session)", instance.session))
}

/// Recover all orphaned Ralph instances
/// Returns a list of recovered sessions and any errors
pub async fn recover_all_ralph_instances() -> Result<RecoveryResult, String> {
    let orphaned = find_orphaned_ralph_instances()?;

    let mut recovered = Vec::new();
    let mut errors = Vec::new();

    for instance in orphaned {
        match recover_ralph_instance(&instance, None).await {
            Ok(msg) => recovered.push(msg),
            Err(e) => errors.push(format!("{}: {}", instance.session, e)),
        }
    }

    Ok(RecoveryResult { recovered, errors })
}

/// Result of a recovery operation
#[derive(Debug, Clone)]
pub struct RecoveryResult {
    pub recovered: Vec<String>,
    pub errors: Vec<String>,
}

impl RecoveryResult {
    pub fn is_empty(&self) -> bool {
        self.recovered.is_empty() && self.errors.is_empty()
    }

    pub fn summary(&self) -> String {
        if self.is_empty() {
            "No sessions to recover".to_string()
        } else {
            format!(
                "Recovered {} session(s), {} error(s)",
                self.recovered.len(),
                self.errors.len()
            )
        }
    }

    /// Merge another RecoveryResult into this one
    pub fn merge(&mut self, other: RecoveryResult) {
        self.recovered.extend(other.recovered);
        self.errors.extend(other.errors);
    }
}

/// Information about an orphaned team agent session that can be recovered
#[derive(Debug, Clone)]
pub struct OrphanedTeamSession {
    /// The team name (e.g., "default")
    pub team: String,
    /// The agent name (e.g., "dan")
    pub agent: String,
    /// The full session name (e.g., "agent-default-dan")
    pub session: String,
    /// Path to the agent directory
    pub agent_dir: PathBuf,
}

/// Session registry entry for parsing the JSONL file
#[derive(Debug, Clone, serde::Deserialize)]
struct RegistryEntry {
    tmux_session: String,
    #[allow(dead_code)]
    agent: String,
    agent_dir: String,
    #[serde(default)]
    team: String,
    #[allow(dead_code)]
    start_time: Option<String>,
}

/// Check if a team has an active project file
/// Used to determine if a team session should be recovered
fn team_has_active_project(team_name: &str) -> bool {
    use std::fs;

    let nolan_root = match std::env::var("NOLAN_ROOT") {
        Ok(r) => r,
        Err(_) => return false,
    };

    let state_file = PathBuf::from(&nolan_root)
        .join(".state")
        .join(team_name)
        .join("active-project.txt");

    if state_file.exists() {
        fs::read_to_string(&state_file)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    } else {
        false
    }
}

/// Find orphaned team sessions from the session registry
/// These are sessions that were registered but no longer have a running tmux session
/// Only returns sessions for teams that have an active project file
/// (teams killed via kill_team_sessions have their active project cleared)
pub fn find_orphaned_team_sessions() -> Result<Vec<OrphanedTeamSession>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use std::collections::HashMap;

    let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
    let registry_path = PathBuf::from(&home).join(".nolan/session-registry.jsonl");

    if !registry_path.exists() {
        return Ok(Vec::new());
    }

    // Get running tmux sessions
    let running_sessions = session::list_sessions().unwrap_or_default();

    // Parse registry and find most recent entry for each session
    // (registry is append-only, so we take the last entry for each session)
    let file = File::open(&registry_path)
        .map_err(|e| format!("Failed to open session registry: {}", e))?;
    let reader = BufReader::new(file);

    let mut session_map: HashMap<String, RegistryEntry> = HashMap::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read registry line: {}", e))?;
        if let Ok(entry) = serde_json::from_str::<RegistryEntry>(&line) {
            // Only track team sessions (not ralph)
            if !entry.team.is_empty() && entry.tmux_session.starts_with("agent-") {
                session_map.insert(entry.tmux_session.clone(), entry);
            }
        }
    }

    // Find sessions that are in registry but not running
    let mut orphaned = Vec::new();
    for (session_name, entry) in session_map {
        // Skip if session is running
        if running_sessions.contains(&session_name) {
            continue;
        }

        // Verify agent directory still exists
        let agent_dir = PathBuf::from(&entry.agent_dir);
        if !agent_dir.exists() {
            continue;
        }

        // Skip if team doesn't have an active project
        // (teams killed via kill_team_sessions have their active project cleared)
        if !team_has_active_project(&entry.team) {
            continue;
        }

        // Verify it's a valid team session format: agent-{team}-{name}
        let parts: Vec<&str> = session_name.strip_prefix("agent-")
            .unwrap_or("")
            .splitn(2, '-')
            .collect();

        if parts.len() == 2 {
            let team_name = parts[0];
            let agent_name = parts[1];

            // Validate agent exists in team config
            // This filters out old entries with instance numbers like "carl-1", "carl-2"
            if let Ok(team_config) = TeamConfig::load(team_name) {
                if !team_config.agent_names().contains(&agent_name) {
                    continue; // Agent name not in team config, skip
                }
            } else {
                continue; // Team config doesn't exist, skip
            }

            orphaned.push(OrphanedTeamSession {
                team: team_name.to_string(),
                agent: agent_name.to_string(),
                session: session_name,
                agent_dir,
            });
        }
    }

    Ok(orphaned)
}

/// Get the active project docs path for a team from state file
fn get_team_docs_path(team_name: &str) -> Option<String> {
    use std::fs;

    let nolan_root = std::env::var("NOLAN_ROOT").ok()?;
    let state_file = PathBuf::from(&nolan_root)
        .join(".state")
        .join(team_name)
        .join("active-project.txt");

    if state_file.exists() {
        fs::read_to_string(&state_file).ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

/// Get the output file for an agent from team config
fn get_agent_output_file(team_name: &str, agent: &str) -> String {
    if let Ok(team) = TeamConfig::load(team_name) {
        team.get_agent(agent)
            .and_then(|a| a.output_file.as_ref())
            .map(|s| s.to_string())
            .unwrap_or_default()
    } else {
        String::new()
    }
}

/// Recover a team agent session by restarting with --continue
pub async fn recover_team_session(orphan: &OrphanedTeamSession) -> Result<String, String> {
    // Check if session already exists (safety check)
    if session::session_exists(&orphan.session)? {
        return Err(format!("Session '{}' already exists", orphan.session));
    }

    // Get paths
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Get docs path from team state (may be empty if no active project)
    let docs_path = get_team_docs_path(&orphan.team).unwrap_or_default();

    // Get output file from team config
    let output_file = get_agent_output_file(&orphan.team, &orphan.agent);

    // Get model for agent
    let model = crate::commands::lifecycle::get_default_model(&orphan.agent);

    // Build command with --continue flag to resume the previous Claude session
    let cmd = format!(
        "export AGENT_NAME={} TEAM_NAME=\"{}\" NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\" OUTPUT_FILE=\"{}\"; claude --dangerously-skip-permissions --model {} --continue; exec bash",
        orphan.agent,
        orphan.team,
        nolan_root.to_string_lossy(),
        projects_dir.to_string_lossy(),
        orphan.agent_dir.to_string_lossy(),
        docs_path,
        output_file,
        model
    );

    // Create session
    let output = Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &orphan.session,
            "-c", &orphan.agent_dir.to_string_lossy(),
            &cmd
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to recover team session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session
    if let Err(e) = crate::commands::lifecycle::register_session(
        &orphan.session,
        &orphan.agent,
        &orphan.agent_dir.to_string_lossy(),
        &orphan.team,
    ) {
        eprintln!("Warning: Failed to register recovered session: {}", e);
    }

    Ok(format!("Recovered: {} (resumed Claude session)", orphan.session))
}

/// Recover all orphaned team sessions
pub async fn recover_all_team_sessions() -> Result<RecoveryResult, String> {
    let orphaned = find_orphaned_team_sessions()?;

    let mut recovered = Vec::new();
    let mut errors = Vec::new();

    for orphan in orphaned {
        match recover_team_session(&orphan).await {
            Ok(msg) => recovered.push(msg),
            Err(e) => errors.push(format!("{}: {}", orphan.session, e)),
        }
    }

    Ok(RecoveryResult { recovered, errors })
}

/// Recover all orphaned sessions (both Ralph instances and team sessions)
pub async fn recover_all_sessions() -> Result<RecoveryResult, String> {
    let mut result = recover_all_ralph_instances().await?;
    let team_result = recover_all_team_sessions().await?;
    result.merge(team_result);
    Ok(result)
}
