use chrono;
use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use crate::config::TeamConfig;
use crate::constants::{
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

    // Validate agent name against team config
    let agent_name = &caps[1];
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let valid_agents = team.agent_names();

    if !valid_agents.contains(&agent_name) {
        return Err(format!(
            "Invalid agent name: '{}'. Valid agents: {:?}",
            agent_name, valid_agents
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
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let valid_agents = team.agent_names();

    if !valid_agents.contains(&agent) {
        return Err(format!(
            "Invalid agent: '{}'. Valid agents: {:?}",
            agent, valid_agents
        ));
    }
    Ok(())
}

/// Maximum spawned instances per agent
const MAX_INSTANCES: u32 = 5;

/// Get team-namespaced state directory
/// Creates the directory if it doesn't exist
fn get_team_state_dir(team_name: &str) -> Result<std::path::PathBuf, String> {
    use std::fs;
    use std::path::PathBuf;

    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set".to_string())?;

    let state_dir = PathBuf::from(nolan_root)
        .join(".state")
        .join(team_name);

    // Create directory if it doesn't exist
    fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to create state directory: {}", e))?;

    Ok(state_dir)
}

/// Get path to team's active project state file
fn get_team_active_project_file(team_name: &str) -> Result<std::path::PathBuf, String> {
    Ok(get_team_state_dir(team_name)?.join("active-project.txt"))
}

/// Register a session in the session registry for history lookup
fn register_session(tmux_session: &str, agent: &str, agent_dir: &str) -> Result<(), String> {
    use std::fs::{OpenOptions, create_dir_all};
    use std::io::Write;

    let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
    let registry_dir = std::path::PathBuf::from(&home).join(".nolan");
    let registry_path = registry_dir.join("session-registry.jsonl");

    // Ensure directory exists
    create_dir_all(&registry_dir)
        .map_err(|e| format!("Failed to create .nolan directory: {}", e))?;

    // Create registry entry
    let entry = serde_json::json!({
        "tmux_session": tmux_session,
        "agent": agent,
        "agent_dir": agent_dir,
        "start_time": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
    });

    // Append to registry file
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&registry_path)
        .map_err(|e| format!("Failed to open session registry: {}", e))?;

    writeln!(file, "{}", entry)
        .map_err(|e| format!("Failed to write to session registry: {}", e))?;

    // Also update the in-memory index used by history streaming
    crate::commands::history::update_session_index(tmux_session, agent, agent_dir);

    Ok(())
}

/// Default models for each agent (loaded from team config)
fn get_default_model(agent: &str, team: &TeamConfig) -> String {
    team.get_agent(agent)
        .map(|a| a.model.clone())
        .unwrap_or_else(|| "sonnet".to_string())
}

/// Determine which agents are needed based on project phase status in NOTES.md
/// Returns None if NOTES.md doesn't exist (new project - launch all agents)
/// Returns Some(Vec<agent_names>) for existing projects based on incomplete phases
fn determine_needed_agents(docs_path: &std::path::Path, team: &TeamConfig) -> Option<Vec<String>> {
    use std::fs;

    let notes_path = docs_path.join("NOTES.md");
    let content = fs::read_to_string(&notes_path).ok()?;

    // Check if project is complete - only launch coordinator
    let coordinator = team.coordinator().to_string();
    if content.contains("<!-- PROJECT:STATUS:COMPLETE") {
        return Some(vec![coordinator.clone()]);
    }

    // Parse Phase Status table to find incomplete phases
    // Format: | Phase | Status | Assigned | Output |
    let mut needed_agents: Vec<String> = vec![coordinator.clone()]; // Coordinator always needed

    // Build phase-to-agent mapping from team config workflow phases
    let mut phase_to_agent: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for phase in &team.team.workflow.phases {
        // Add multiple variations of phase name for matching
        let phase_lower = phase.name.to_lowercase();
        phase_to_agent.insert(phase_lower.clone(), phase.owner.clone());
        // Also add common abbreviations
        if phase_lower.contains("research") {
            phase_to_agent.insert("research".to_string(), phase.owner.clone());
        }
        if phase_lower.contains("plan") && !phase_lower.contains("review") {
            phase_to_agent.insert("planning".to_string(), phase.owner.clone());
            phase_to_agent.insert("plan".to_string(), phase.owner.clone());
        }
        if phase_lower.contains("implement") {
            phase_to_agent.insert("implementation".to_string(), phase.owner.clone());
            phase_to_agent.insert("implement".to_string(), phase.owner.clone());
        }
        if phase_lower.contains("review") || phase_lower.contains("qa") {
            phase_to_agent.insert("qa".to_string(), phase.owner.clone());
            phase_to_agent.insert("qa review".to_string(), phase.owner.clone());
        }
    }

    // Find the Phase Status table
    let lines: Vec<&str> = content.lines().collect();
    let mut in_phase_table = false;
    let mut has_incomplete_phases = false;

    for line in &lines {
        let line_lower = line.to_lowercase();

        // Detect table header
        if line_lower.contains("| phase") && line_lower.contains("| status") {
            in_phase_table = true;
            continue;
        }

        // Skip separator line
        if in_phase_table && line.starts_with("|---") {
            continue;
        }

        // End of table
        if in_phase_table && !line.starts_with('|') {
            break;
        }

        if in_phase_table {
            // Parse table row: | Phase | Status | ...
            let parts: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
            if parts.len() >= 3 {
                let phase = parts[1].to_lowercase();
                let status = parts[2].to_lowercase();

                // Check if phase is NOT complete
                let is_complete = status.contains("complete") || status.contains("✅");

                if !is_complete {
                    has_incomplete_phases = true;
                    // Find which agent owns this phase
                    for (phase_keyword, agent) in &phase_to_agent {
                        if phase.contains(phase_keyword) {
                            if !needed_agents.contains(agent) {
                                needed_agents.push(agent.clone());
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    // If no incomplete phases found but project not marked complete,
    // launch all agents (could be starting new work)
    if !has_incomplete_phases && needed_agents.len() == 1 {
        return None; // Launch all
    }

    // Find implementation agent and its QA reviewer from workflow phases
    // If implementation agent is needed, also include its QA reviewer
    let impl_phase = team.team.workflow.phases.iter()
        .find(|p| p.name.to_lowercase().contains("implement") && !p.name.to_lowercase().contains("audit"));
    let review_phase = team.team.workflow.phases.iter()
        .find(|p| p.name.to_lowercase().contains("review") && !p.name.to_lowercase().contains("audit"));

    if let (Some(impl_p), Some(review_p)) = (impl_phase, review_phase) {
        if needed_agents.contains(&impl_p.owner) && !needed_agents.contains(&review_p.owner) {
            needed_agents.push(review_p.owner.clone());
        }
    }

    Some(needed_agents)
}

/// Count actual running spawned instances for an agent
/// Ralph uses ephemeral agent-ralph-{5chars} format, others use agent-{name}-{number}
fn count_running_instances(agent: &str) -> Result<usize, String> {
    let sessions = crate::tmux::session::list_sessions()?;

    if agent == "ralph" {
        // For Ralph, count ephemeral instances: agent-ralph-{5chars}
        Ok(sessions.iter().filter(|s| {
            if let Some(instance_id) = s.strip_prefix("agent-ralph-") {
                instance_id.len() == 5 && instance_id.chars().all(|c| c.is_alphanumeric())
            } else {
                false
            }
        }).count())
    } else {
        // For other agents, count numbered instances: agent-{name}-{number}
        let pattern = format!(r"^agent-{}-[0-9]+$", agent);
        let re = Regex::new(&pattern)
            .map_err(|e| format!("Invalid regex pattern: {}", e))?;
        Ok(sessions.iter().filter(|s| re.is_match(s)).count())
    }
}

/// Find next available instance number with gap reuse
/// If instances 2, 4, 5 exist, returns 3 (first gap)
/// If no core agent exists, starts at 1 instead of 2
fn find_next_available_instance(agent: &str) -> Result<u32, String> {
    let sessions = crate::tmux::session::list_sessions()?;
    let pattern = format!(r"^agent-{}-(\d+)$", agent);
    let re = Regex::new(&pattern)
        .map_err(|e| format!("Invalid regex pattern: {}", e))?;

    // Extract running instance numbers
    let mut running_nums: Vec<u32> = sessions.iter()
        .filter_map(|s| re.captures(s))
        .filter_map(|c| c.get(1).and_then(|m| m.as_str().parse().ok()))
        .collect();
    running_nums.sort();

    // Determine start (2 if core agent exists, 1 otherwise)
    let core_session = format!("agent-{}", agent);
    let start = if crate::tmux::session::session_exists(&core_session).unwrap_or(false) { 2 } else { 1 };

    // Find first gap in the sequence
    for i in start..=MAX_INSTANCES {
        if !running_nums.contains(&i) {
            return Ok(i);
        }
    }

    // No gaps found, return next sequential number
    Ok(running_nums.last().map(|n| n + 1).unwrap_or(start))
}

/// Generate a random 4-letter alphanumeric name
/// Used for ephemeral agent directories to avoid collisions
fn generate_random_name() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hash, Hasher};

    // Use timestamp + random hash to generate a 5-letter name
    // (5 chars to avoid collision with agent names like bill, carl, enzo which are 4 chars)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    // Also add a random component
    let random_state = RandomState::new();
    let mut hasher = random_state.build_hasher();
    now.hash(&mut hasher);
    let hash_value = hasher.finish();

    // Convert to base36 and take 5 chars
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut name = String::with_capacity(5);
    let mut val = hash_value;
    for _ in 0..5 {
        name.push(CHARS[(val % 36) as usize] as char);
        val /= 36;
    }
    name
}

/// Get the active project DOCS_PATH from team context
/// Tries state file first, then falls back to reading project from running team member's statusline
fn get_docs_path_from_team_context() -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Try to read team-namespaced state file first (default team)
    // Note: We use "default" team here as this is for global context detection
    let state_file = get_team_active_project_file("default")?;
    if state_file.exists() {
        if let Ok(docs_path) = fs::read_to_string(&state_file) {
            let trimmed = docs_path.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(trimmed);
            }
        }
    }

    // Fallback: Find running team member and extract project from their statusline
    let sessions = crate::tmux::session::list_sessions()?;

    // Load team config to get workflow participants
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    // Priority order: coordinator first (best context), then others
    let mut agent_priority: Vec<&str> = vec![team.coordinator()];
    agent_priority.extend(team.workflow_participants().iter().filter(|&&a| a != team.coordinator()));

    for &agent_name in &agent_priority {
        let session = format!("agent-{}", agent_name);
        if !sessions.contains(&session) {
            continue; // Agent not running, try next
        }

        // Capture last 5 lines from pane
        let output = Command::new("tmux")
            .args(&["capture-pane", "-t", &session, "-p", "-S", "-5"])
            .output();

        if let Ok(o) = output {
            let content = String::from_utf8_lossy(&o.stdout);

            // Look for statusline with project: "agent | model | XX% | $Y | project"
            for line in content.lines().rev() {
                // Match pattern like: "  dan | sonnet | 42% | $0.12 | my-project"
                if let Some(caps) = regex::Regex::new(r"\|\s+(\S+)\s*$")
                    .ok()
                    .and_then(|re| re.captures(line))
                {
                    let project_name = caps[1].trim().to_string();
                    if !project_name.is_empty() && project_name != "VIBING" {
                        let docs_path = projects_dir.join(&project_name);
                        if docs_path.exists() {
                            return Ok(docs_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    Err(
        "No active team context found. Please launch the core team with a project first.".to_string(),
    )
}

/// Launch core team agents (dan, ana, bill, carl, enzo) with project context
///
/// Parameters:
/// - `initial_prompt`: For new projects - written to prompt.md and sent to Dan
/// - `updated_original_prompt`: For existing projects - only written to prompt.md if provided (meaning it was modified)
/// - `followup_prompt`: For existing projects - sent to Dan to resume work
#[tauri::command]
pub async fn launch_core(
    app_handle: AppHandle,
    project_name: String,
    initial_prompt: Option<String>,
    updated_original_prompt: Option<String>,
    followup_prompt: Option<String>,
) -> Result<String, String> {
    use std::process::Command;
    use std::fs;

    // Load team config
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    // Get paths using utility functions
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    let agents_base = crate::utils::paths::get_agents_dir()?;

    // Compute DOCS_PATH for the project
    let docs_path = projects_dir.join(&project_name);

    // Validate project directory exists
    if !docs_path.exists() {
        return Err(format!("Project directory does not exist: {:?}", docs_path));
    }

    // Write team state: store the active project for restart_core_agent to inherit
    // Use team-namespaced state file
    let state_file = get_team_active_project_file(&team.team.name)?;
    fs::write(&state_file, docs_path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to write team state: {}", e))?;

    let nolan_root_str = nolan_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let docs_path_str = docs_path.to_string_lossy();

    // Handle prompt.md writing and determine what to send to Dan
    let prompt_file = docs_path.join("prompt.md");
    let effective_prompt: Option<String> = if let Some(ref prompt) = initial_prompt {
        // New project: write initial prompt to file and send to Dan
        // Add HANDOFF marker to indicate prompt has been initialized
        let now = chrono::Local::now();
        let timestamp = now.format("%Y-%m-%d %H:%M").to_string();
        let content = format!("{}\n\n<!-- HANDOFF:{}:user:COMPLETE -->", prompt, timestamp);
        fs::write(&prompt_file, &content)
            .map_err(|e| format!("Failed to write prompt.md: {}", e))?;
        Some(prompt.clone())
    } else {
        // Existing project case
        // If original prompt was modified, update the file
        if let Some(ref updated_prompt) = updated_original_prompt {
            // Add HANDOFF marker when updating existing prompt
            let now = chrono::Local::now();
            let timestamp = now.format("%Y-%m-%d %H:%M").to_string();
            let content = format!("{}\n\n<!-- HANDOFF:{}:user:COMPLETE -->", updated_prompt, timestamp);
            fs::write(&prompt_file, &content)
                .map_err(|e| format!("Failed to update prompt.md: {}", e))?;
        }
        // Send followup prompt to Dan (the action prompt)
        followup_prompt.clone()
    };

    // Determine which agents to launch based on project phase status
    // For new projects (initial_prompt present), launch all agents
    // For existing projects, only launch agents needed for current/upcoming phases
    let agents_to_launch: Vec<String> = if initial_prompt.is_some() {
        // New project - launch all core team members
        team.core_team_members().iter().map(|s| s.to_string()).collect()
    } else {
        // Existing project - determine needed agents from NOTES.md phase status
        determine_needed_agents(&docs_path, &team)
            .unwrap_or_else(|| team.core_team_members().iter().map(|s| s.to_string()).collect())
    };

    let mut launched = Vec::new();
    let mut already_running = Vec::new();
    let mut errors = Vec::new();
    let mut skipped = Vec::new();

    for agent in team.core_team_members() {
        // Skip agents not needed for current project phase
        if !agents_to_launch.contains(&agent.to_string()) {
            skipped.push(agent.to_string());
            continue;
        }

        let session = format!("agent-{}", agent);
        let agent_dir = agents_base.join(agent);
        let agent_dir_str = agent_dir.to_string_lossy();

        // Skip if session already exists
        if crate::tmux::session::session_exists(&session).unwrap_or(false) {
            already_running.push(agent.to_string());
            continue;
        }

        // Verify agent directory exists
        if !agent_dir.exists() {
            errors.push(format!("{}: directory not found", agent));
            continue;
        }

        // Get agent's model from team config
        let model = get_default_model(agent, &team);

        // Create tmux session with Claude - now includes DOCS_PATH
        let cmd = format!(
            "export AGENT_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
            agent, nolan_root_str, projects_dir_str, agent_dir_str, docs_path_str, model
        );

        let output = Command::new("tmux")
            .args(&["new-session", "-d", "-s", &session, "-c", agent_dir_str.as_ref(), &cmd])
            .output();

        match output {
            Ok(o) if o.status.success() => {
                launched.push(agent.to_string());

                // Register session in the registry for history lookup (non-fatal)
                if let Err(e) = register_session(&session, agent, agent_dir_str.as_ref()) {
                    eprintln!("Warning: Failed to register session {}: {}", session, e);
                }

                // Auto-start terminal stream for new session (non-fatal)
                let manager = STREAM_MANAGER.read().await;
                if let Err(e) = manager.start_session_stream(app_handle.clone(), &session).await {
                    eprintln!("Warning: Failed to start terminal stream for {}: {}", session, e);
                    // Non-fatal - agent still works, embedded terminal just won't stream
                }
            }
            Ok(o) => errors.push(format!("{}: {}", agent, String::from_utf8_lossy(&o.stderr))),
            Err(e) => errors.push(format!("{}: {}", agent, e)),
        }
    }

    // Emit status change event
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    // If coordinator was launched and we have a prompt, wait for Claude to be ready then send it
    let coordinator = team.coordinator().to_string();
    if launched.contains(&coordinator) {
        if let Some(prompt) = effective_prompt {
            let coordinator_session = format!("agent-{}", coordinator);
            tokio::spawn(async move {
                // Wait for Claude to be ready (poll for status line indicator)
                let max_attempts = 30; // 30 seconds max
                let poll_interval = std::time::Duration::from_secs(1);

                for _ in 0..max_attempts {
                    tokio::time::sleep(poll_interval).await;

                    // Check if Claude is ready by looking for the status line
                    let output = Command::new("tmux")
                        .args(&["capture-pane", "-t", &coordinator_session, "-p", "-S", "-3"])
                        .output();

                    if let Ok(o) = output {
                        let content = String::from_utf8_lossy(&o.stdout);
                        // Claude is ready when we see the status line pattern (contains "|")
                        // or the input prompt (">")
                        if content.contains(" | ") || content.lines().any(|l| l.trim().starts_with(">")) {
                            // Small extra delay for UI to settle
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                            // Send the prompt to coordinator
                            let _ = Command::new("tmux")
                                .args(&["send-keys", "-t", &coordinator_session, "-l", &prompt])
                                .output();

                            // Small delay then send Enter
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                            let _ = Command::new("tmux")
                                .args(&["send-keys", "-t", &coordinator_session, "C-m"])
                                .output();

                            break;
                        }
                    }
                }
            });
        }
    }

    // Build result message
    let mut msg = String::new();
    if !launched.is_empty() {
        msg.push_str(&format!("Launched: {} (project: {})", launched.join(", "), project_name));
    }
    if !already_running.is_empty() {
        if !msg.is_empty() { msg.push_str(". "); }
        msg.push_str(&format!("Already running: {}", already_running.join(", ")));
    }
    if !skipped.is_empty() {
        if !msg.is_empty() { msg.push_str(". "); }
        msg.push_str(&format!("Skipped (not needed for current phase): {}", skipped.join(", ")));
    }
    if !errors.is_empty() {
        if !msg.is_empty() { msg.push_str(". "); }
        msg.push_str(&format!("Errors: {}", errors.join("; ")));
    }

    if msg.is_empty() {
        msg = "No agents to launch".to_string();
    }

    if errors.is_empty() {
        Ok(msg)
    } else {
        Err(msg)
    }
}

/// Kill all core team agents (requires user confirmation in frontend)
/// Native implementation - no longer delegates to kill-core.sh
#[tauri::command]
pub async fn kill_core(app_handle: AppHandle) -> Result<String, String> {
    // Load team config
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    let mut killed = Vec::new();
    let mut not_running = Vec::new();
    let mut errors = Vec::new();

    for agent in team.core_team_members() {
        let session = format!("agent-{}", agent);

        match crate::tmux::session::session_exists(&session) {
            Ok(true) => {
                match crate::tmux::session::kill_session(&session) {
                    Ok(_) => killed.push(agent.to_string()),
                    Err(e) => errors.push(format!("{}: {}", agent, e)),
                }
            }
            Ok(false) => not_running.push(agent.to_string()),
            Err(e) => errors.push(format!("{}: {}", agent, e)),
        }
    }

    // Emit status change event after operation
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    // Build result message
    let mut msg = String::new();
    if !killed.is_empty() {
        msg.push_str(&format!("Killed: {}", killed.join(", ")));
    }
    if !not_running.is_empty() {
        if !msg.is_empty() { msg.push_str(". "); }
        msg.push_str(&format!("Not running: {}", not_running.join(", ")));
    }
    if !errors.is_empty() {
        if !msg.is_empty() { msg.push_str(". "); }
        msg.push_str(&format!("Errors: {}", errors.join("; ")));
    }

    if msg.is_empty() {
        msg = "No core agents to kill".to_string();
    }

    if errors.is_empty() {
        Ok(msg)
    } else {
        Err(msg)
    }
}

/// Spawn a new agent instance
/// Native implementation - no longer delegates to spawn-agent.sh
#[tauri::command]
pub async fn spawn_agent(app_handle: AppHandle, agent: String, force: bool, model: Option<String>) -> Result<String, String> {
    use std::process::Command;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    // Load team config
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    // Validate agent name
    validate_agent_name(&agent)?;

    // Validate model if provided
    if let Some(ref m) = model {
        if !["opus", "sonnet", "haiku"].contains(&m.as_str()) {
            return Err(format!(
                "Invalid model: '{}'. Valid models: opus, sonnet, haiku",
                m
            ));
        }
    }

    // Count actual running instances
    let running = count_running_instances(&agent)?;

    // Check instance limit (unless --force)
    if running >= MAX_INSTANCES as usize && !force {
        return Err(format!(
            "Max instances ({}) reached for {} ({} currently running). Use force to override.",
            MAX_INSTANCES, agent, running
        ));
    }

    // Find next available instance identifier
    // For Ralph agents, generate a random 4-letter name for ephemeral directories
    // Other agents use numbered instances
    let instance_id = if agent == "ralph" {
        generate_random_name()
    } else {
        find_next_available_instance(&agent)?.to_string()
    };

    // For Ralph, create ephemeral agent directory: /agents/agent-{random4letter}/
    // For other agents, use numbered instances: /agents/{agent}-{number}/
    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let agent_dir = if agent == "ralph" {
        // Ephemeral Ralph: agent-{random5} directory at top level (flat for .claude loading)
        agents_dir.join(format!("agent-{}", instance_id))
    } else {
        // Numbered instances for other agents
        let base_agent_dir = agents_dir.join(&agent);
        if !base_agent_dir.exists() {
            return Err(format!("Agent directory not found: {:?}", base_agent_dir));
        }
        base_agent_dir
    };

    // Session naming: agent-ralph-{random5} for Ralph (matches frontend), agent-{name}-{num} for others
    let session = if agent == "ralph" {
        format!("agent-ralph-{}", instance_id)
    } else {
        format!("agent-{}-{}", agent, instance_id)
    };

    // Check if this session already exists (shouldn't happen, but safety check)
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
        #[cfg(unix)]
        {
            let app_claude = crate::utils::paths::get_nolan_app_root()
                .ok()
                .and_then(|root| {
                    let path = root.join(".claude");
                    if path.exists() {
                        Some(path)
                    } else {
                        None
                    }
                });

            if let Some(claude_path) = app_claude {
                let claude_link = agent_dir.join(".claude");
                if !claude_link.exists() && !claude_link.is_symlink() {
                    if let Err(e) = symlink(&claude_path, &claude_link) {
                        eprintln!("Warning: Failed to create .claude symlink: {}", e);
                    }
                }
            }
        }

        // Create symlink to CLAUDE.md for agent instructions
        #[cfg(unix)]
        {
            let base_agent_dir = agents_dir.join(&agent);
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
    let projects_dir_str = projects_dir.to_string_lossy();
    let agent_dir_str = agent_dir.to_string_lossy();

    // Use provided model or default for agent
    let model_str = model.unwrap_or_else(|| get_default_model(&agent, &team));

    // Create tmux session (same pattern as launch_core)
    let cmd = format!(
        "export AGENT_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
        agent, nolan_root_str, projects_dir_str, agent_dir_str, model_str
    );

    let output = Command::new("tmux")
        .args(&["new-session", "-d", "-s", &session, "-c", agent_dir_str.as_ref(), &cmd])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to spawn agent session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session in the registry for history lookup (non-fatal)
    if let Err(e) = register_session(&session, &agent, agent_dir_str.as_ref()) {
        eprintln!("Warning: Failed to register session {}: {}", session, e);
    }

    // Auto-start terminal stream for new session (non-fatal)
    let manager = STREAM_MANAGER.read().await;
    if let Err(e) = manager.start_session_stream(app_handle.clone(), &session).await {
        eprintln!("Warning: Failed to start terminal stream for {}: {}", session, e);
        // Non-fatal - agent still works, embedded terminal just won't stream
    }

    // Emit status change event after successful spawn
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    Ok(format!("Spawned: {}", session))
}

/// Restart a core agent (creates unnumbered session: agent-{name})
#[tauri::command]
pub async fn restart_core_agent(app_handle: AppHandle, agent: String) -> Result<String, String> {
    use std::process::Command;

    // Load team config
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    // Validate this is a core agent (not a multi-instance agent - use spawn for those)
    let core_members = team.core_team_members();
    if !core_members.contains(&agent.as_str()) {
        return Err(format!(
            "Cannot restart '{}' as core agent. Use spawn instead. Core agents: {:?}",
            agent, core_members
        ));
    }

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

    // Inherit DOCS_PATH from active team to rejoin the project
    let docs_path = get_docs_path_from_team_context()?;

    // Get agent's model from team config
    let model = get_default_model(&agent, &team);

    // Create tmux session with inherited project context
    let cmd = format!(
        "export AGENT_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
        agent, nolan_root_str, projects_dir_str, agent_dir_str, docs_path, model
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

    // Register session in the registry for history lookup (non-fatal)
    if let Err(e) = register_session(&session, &agent, agent_dir_str.as_ref()) {
        eprintln!("Warning: Failed to register session {}: {}", session, e);
    }

    // Auto-start terminal stream for restarted session (non-fatal)
    let manager = STREAM_MANAGER.read().await;
    if let Err(e) = manager.start_session_stream(app_handle.clone(), &session).await {
        eprintln!("Warning: Failed to start terminal stream for {}: {}", session, e);
        // Non-fatal - agent still works, embedded terminal just won't stream
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
    use std::fs;

    // SECURITY: Validate session name before killing
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Kill the session
    crate::tmux::session::kill_session(&session)?;

    // For ephemeral Ralph agents (agent-ralph-{random5}), delete the agent directory
    // Session: agent-ralph-{5chars}, Directory: agent-{5chars}
    if let Some(instance_id) = session.strip_prefix("agent-ralph-") {
        if instance_id.len() == 5 && instance_id.chars().all(|c| c.is_alphanumeric()) {
            // This is an ephemeral agent, delete its directory
            let agents_dir = crate::utils::paths::get_agents_dir()
                .unwrap_or_else(|_| std::path::PathBuf::new());
            let agent_path = agents_dir.join(format!("agent-{}", instance_id));

            if agent_path.exists() {
                if let Err(e) = fs::remove_dir_all(&agent_path) {
                    eprintln!("Warning: Failed to delete ephemeral agent directory: {}", e);
                }
            }
        }
    }

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
    use std::fs;

    // Validate agent name
    validate_agent_name(&agent)?;

    let sessions = crate::tmux::session::list_sessions()?;
    let mut killed: Vec<String> = Vec::new();

    if agent == "ralph" {
        // For Ralph, find all ephemeral instances: agent-ralph-{5chars}
        for session in &sessions {
            if let Some(instance_id) = session.strip_prefix("agent-ralph-") {
                if instance_id.len() == 5 && instance_id.chars().all(|c| c.is_alphanumeric()) {
                    if crate::tmux::session::kill_session(session).is_ok() {
                        // Delete the ephemeral agent directory (agent-{5chars})
                        let agents_dir = crate::utils::paths::get_agents_dir()
                            .unwrap_or_else(|_| std::path::PathBuf::new());
                        let agent_path = agents_dir.join(format!("agent-{}", instance_id));
                        if agent_path.exists() {
                            let _ = fs::remove_dir_all(&agent_path);
                        }
                        killed.push(session.to_string());
                    }
                }
            }
        }
    } else {
        // For other agents, find numbered instances: agent-{name}-{number}
        let pattern = format!("^agent-{}-[0-9]+$", agent);
        let re = Regex::new(&pattern)
            .map_err(|e| format!("Invalid regex pattern: {}", e))?;

        for session in &sessions {
            if re.is_match(session) {
                if crate::tmux::session::kill_session(session).is_ok() {
                    killed.push(session.to_string());
                }
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

/// Parsed status line data
struct StatusLineData {
    context_usage: Option<u8>,
    current_project: Option<String>,
}

/// Parse status line data from Claude statusline
/// Expected format: "  {agent} | {model} | {percentage}% | ${cost} | {project}"
fn parse_statusline(session: &str) -> StatusLineData {
    use std::process::Command;

    let mut data = StatusLineData {
        context_usage: None,
        current_project: None,
    };

    // Capture last 5 lines from tmux pane
    let output = match Command::new("tmux")
        .args(&["capture-pane", "-t", session, "-p", "-S", "-5"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return data,
    };

    let content = String::from_utf8_lossy(&output.stdout);

    // Try new format first: "  agent | model | XX% | $Y.YY | project"
    // Use lenient matching with [^|]+ for fields between pipes
    let re_new = Regex::new(r"^\s+[^|]+\|[^|]+\|\s*(\d+)%\s*\|[^|]+\|\s*(\S+)\s*$").ok();

    // Fallback to old format: "  agent | model | XX% | $Y.YY"
    let re_old = Regex::new(r"^\s+\w+\s+\|\s+[\w\s.]+\s+\|\s+(\d+)%").ok();

    for line in content.lines().rev() {
        // Try new format with project
        if let Some(ref re) = re_new {
            if let Some(caps) = re.captures(line) {
                if let Ok(percentage) = caps[1].parse::<u8>() {
                    data.context_usage = Some(percentage);
                }
                let project = caps[2].to_string();
                if project != "VIBING" {
                    data.current_project = Some(project);
                }
                break;
            }
        }

        // Fallback to old format (no project)
        if let Some(ref re) = re_old {
            if let Some(caps) = re.captures(line) {
                if let Ok(percentage) = caps[1].parse::<u8>() {
                    data.context_usage = Some(percentage);
                }
                break;
            }
        }
    }

    data
}

/// Get status of all agents
#[tauri::command]
pub async fn get_agent_status() -> Result<AgentStatusList, String> {
    let sessions = crate::tmux::session::list_sessions()?;

    // Load team config first to get valid agent lists
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let core_members: Vec<&str> = team.core_team_members();
    let valid_agents: Vec<&str> = team.agent_names();

    // Filter to agent-* sessions only
    let mut core_agents = Vec::new();
    let mut spawned_sessions = Vec::new();

    for session in sessions {
        if session.starts_with("agent-") {
            // Check if it's a core agent (agent-{name} without number)
            if let Some(caps) = RE_CORE_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if core_members.contains(&agent_name.as_str()) {
                    // Get session info
                    if let Ok(info) = crate::tmux::session::get_session_info(&session) {
                        // Parse statusline data
                        let statusline = parse_statusline(&session);

                        core_agents.push(AgentStatus {
                            name: agent_name,
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                            context_usage: statusline.context_usage,
                            current_project: statusline.current_project,
                            created_at: Some(info.created_at * 1000),  // Convert to milliseconds
                        });
                    }
                }
            } else if let Some(caps) = RE_SPAWNED_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if valid_agents.contains(&agent_name.as_str()) {
                    // Get session info
                    if let Ok(info) = crate::tmux::session::get_session_info(&session) {
                        // Parse statusline data
                        let statusline = parse_statusline(&session);

                        spawned_sessions.push(AgentStatus {
                            name: agent_name,
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                            context_usage: statusline.context_usage,
                            current_project: statusline.current_project,
                            created_at: Some(info.created_at * 1000),  // Convert to milliseconds
                        });
                    }
                }
            }
            // Note: Ephemeral sessions (agent-{name}-{5chars}) are handled by RE_SPAWNED_AGENT above
        }
    }

    // Add inactive core agents (coordinator + workflow participants)
    for agent in &core_members {
        let session_name = format!("agent-{}", agent);
        if !core_agents.iter().any(|a| a.name == *agent) {
            core_agents.push(AgentStatus {
                name: agent.to_string(),
                active: false,
                session: session_name,
                attached: false,
                context_usage: None,
                current_project: None,
                created_at: None,
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
    pub current_project: Option<String>,  // Current project from statusline (None if VIBING)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<u64>,  // Unix timestamp in milliseconds (for spawned agents)
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
    // This closes existing terminal windows and prevents duplicates
    let _ = Command::new("tmux")
        .arg("detach-client")
        .arg("-s")
        .arg(&session)
        .output();

    // Reset tmux window to auto-size mode
    // This allows the external terminal to resize the pane to its own dimensions
    // instead of being locked to the embedded terminal's size
    let _ = Command::new("tmux")
        .args(&["resize-window", "-t", &session, "-A"])
        .output();

    // Small delay to allow terminal window to close
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Generate title
    let title = format!("Agent: {}", session);

    // Use gnome-terminal for single sessions
    launch_terminal(session, "gnome-terminal".to_string(), Some(title)).await
}

/// Launch individual terminals for core team agents
#[tauri::command]
pub async fn open_core_team_terminals() -> Result<String, String> {
    use std::process::Command;

    // Load team config to get core team members
    let team = TeamConfig::load("default")
        .map_err(|e| format!("Failed to load team config: {}", e))?;

    // Build list of core agent sessions from team config
    let core_agent_sessions: Vec<String> = team.core_team_members()
        .iter()
        .map(|agent| format!("agent-{}", agent))
        .collect();

    // Verify at least some core agents are running
    let sessions = crate::tmux::session::list_sessions()?;

    let mut opened = Vec::new();
    let mut errors = Vec::new();

    for session in &core_agent_sessions {
        if sessions.contains(session) {
            // Detach any existing clients from this session first
            // This closes existing terminal windows and prevents duplicates
            let _ = Command::new("tmux")
                .arg("detach-client")
                .arg("-s")
                .arg(session)
                .output();

            // Reset tmux window to auto-size mode for external terminal
            let _ = Command::new("tmux")
                .args(&["resize-window", "-t", session, "-A"])
                .output();

            // Small delay to allow terminal windows to close
            std::thread::sleep(std::time::Duration::from_millis(100));

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

/// Read agent's CLAUDE.md file content
/// Creates the file with a template if it doesn't exist
#[tauri::command]
pub async fn read_agent_claude_md(agent: String) -> Result<String, String> {
    use std::fs;

    // Validate agent name
    validate_agent_name(&agent)?;

    // Get agent directory
    let agent_dir = crate::utils::paths::get_agents_dir()?.join(&agent);
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
    fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Write agent's CLAUDE.md file content
#[tauri::command]
pub async fn write_agent_claude_md(agent: String, content: String) -> Result<String, String> {
    use std::fs;

    // Validate agent name
    validate_agent_name(&agent)?;

    // Get agent directory
    let agent_dir = crate::utils::paths::get_agents_dir()?.join(&agent);
    let claude_md_path = agent_dir.join("CLAUDE.md");

    // Write file content
    fs::write(&claude_md_path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok(format!("Saved CLAUDE.md for {}", agent))
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

// Terminal streaming commands

/// Global terminal stream manager
static STREAM_MANAGER: once_cell::sync::Lazy<tokio::sync::RwLock<crate::tmux::terminal_stream::TerminalStreamManager>> =
    once_cell::sync::Lazy::new(|| {
        tokio::sync::RwLock::new(crate::tmux::terminal_stream::TerminalStreamManager::new())
    });

/// Start terminal output streaming for a session
/// Creates a named pipe (FIFO) and begins streaming output to frontend
#[tauri::command]
pub async fn start_terminal_stream(
    app_handle: AppHandle,
    session: String,
) -> Result<String, String> {
    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Start stream
    let manager = STREAM_MANAGER.read().await;
    manager.start_session_stream(app_handle, &session).await?;

    Ok(format!("Started terminal stream for {}", session))
}

/// Stop terminal output streaming for a session
/// Cleans up the named pipe and stops the streaming task
#[tauri::command]
pub async fn stop_terminal_stream(session: String) -> Result<String, String> {
    // Validate session name
    validate_agent_session(&session)?;

    // Stop stream
    let manager = STREAM_MANAGER.read().await;
    manager.stop_session_stream(&session).await?;

    Ok(format!("Stopped terminal stream for {}", session))
}

/// Send text input to a terminal session
/// Sends literal text without interpretation
#[tauri::command]
pub async fn send_terminal_input(session: String, data: String) -> Result<String, String> {
    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Send input
    crate::tmux::terminal_input::send_terminal_input(&session, &data)?;

    Ok(format!("Sent input to {}", session))
}

/// Send a special key to a terminal session
/// Supports keys like Enter, Backspace, ArrowUp, etc.
#[tauri::command]
pub async fn send_terminal_key(session: String, key: String) -> Result<String, String> {
    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Send key
    crate::tmux::terminal_input::send_terminal_key(&session, &key)?;

    Ok(format!("Sent key '{}' to {}", key, session))
}

/// Resize a terminal session (tmux pane)
/// Notifies the PTY (pseudo-terminal) of new dimensions so content reflows properly
/// This is essential for vim, tmux, and other terminal applications to know the new size
#[tauri::command]
pub async fn resize_terminal(session: String, cols: u32, rows: u32) -> Result<String, String> {
    use std::process::Command;

    // Validate session name
    validate_agent_session(&session)?;

    // Verify session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Validate dimensions (reasonable min/max to prevent errors)
    if cols < 20 || cols > 500 {
        return Err(format!("Invalid column count: {}. Must be between 20 and 500.", cols));
    }
    if rows < 5 || rows > 200 {
        return Err(format!("Invalid row count: {}. Must be between 5 and 200.", rows));
    }

    // Resize the tmux window to match the xterm.js dimensions
    let output = Command::new("tmux")
        .args(&["resize-window", "-t", &session, "-x", &cols.to_string(), "-y", &rows.to_string()])
        .output()
        .map_err(|e| format!("Failed to resize tmux window: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to resize terminal: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(format!("Resized {} to {}x{}", session, cols, rows))
}
