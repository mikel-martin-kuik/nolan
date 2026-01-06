use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use crate::constants::{
    VALID_AGENTS,
    CORE_AGENTS,
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

/// Maximum spawned instances per agent
const MAX_INSTANCES: u32 = 5;

/// Default models for each agent
fn get_default_model(agent: &str) -> &'static str {
    match agent {
        "ralph" => "haiku",
        _ => "sonnet", // ana, bill, carl, dan, enzo all use sonnet
    }
}

/// Count actual running spawned instances for an agent (agent-{name}-N sessions)
fn count_running_instances(agent: &str) -> Result<usize, String> {
    let sessions = crate::tmux::session::list_sessions()?;
    let pattern = format!(r"^agent-{}-[0-9]+$", agent);
    let re = Regex::new(&pattern)
        .map_err(|e| format!("Invalid regex pattern: {}", e))?;
    Ok(sessions.iter().filter(|s| re.is_match(s)).count())
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

/// Get the active project DOCS_PATH from team context
/// Tries state file first, then falls back to reading project from running team member's statusline
fn get_docs_path_from_team_context() -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Try to read state file first
    let state_file = projects_dir.join(".state").join("active-project.txt");
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

    // Priority order: Dan first (Scrum Master has best context), then others
    let agent_priority = ["dan", "ana", "bill", "carl", "enzo"];

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
#[tauri::command]
pub async fn launch_core(
    app_handle: AppHandle,
    project_name: String,
    initial_prompt: Option<String>,
) -> Result<String, String> {
    use std::process::Command;
    use std::fs;

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
    let state_dir = projects_dir.join(".state");
    fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to create state directory: {}", e))?;
    let state_file = state_dir.join("active-project.txt");
    fs::write(&state_file, docs_path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to write team state: {}", e))?;

    let nolan_root_str = nolan_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let docs_path_str = docs_path.to_string_lossy();

    // Determine effective prompt: read from file if exists, otherwise use initial_prompt
    // This preserves any updates made during project iterations
    let prompt_file = docs_path.join("prompt.md");
    let effective_prompt: Option<String> = if prompt_file.exists() {
        // Read existing prompt.md (iteration case - preserves manual edits)
        fs::read_to_string(&prompt_file).ok().filter(|s| !s.trim().is_empty())
    } else if let Some(ref prompt) = initial_prompt {
        // First launch: write initial prompt to file
        fs::write(&prompt_file, prompt)
            .map_err(|e| format!("Failed to write prompt.md: {}", e))?;
        Some(prompt.clone())
    } else {
        None
    };

    let mut launched = Vec::new();
    let mut already_running = Vec::new();
    let mut errors = Vec::new();

    for &agent in CORE_AGENTS {
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

        // All core agents use sonnet model
        let model = "sonnet";

        // Create tmux session with Claude - now includes DOCS_PATH
        let cmd = format!(
            "export AGENT_NAME={} NOLAN_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\"; claude --dangerously-skip-permissions --model {}; exec bash",
            agent, nolan_root_str, projects_dir_str, agent_dir_str, docs_path_str, model
        );

        let output = Command::new("tmux")
            .args(&["new-session", "-d", "-s", &session, "-c", agent_dir_str.as_ref(), &cmd])
            .output();

        match output {
            Ok(o) if o.status.success() => launched.push(agent.to_string()),
            Ok(o) => errors.push(format!("{}: {}", agent, String::from_utf8_lossy(&o.stderr))),
            Err(e) => errors.push(format!("{}: {}", agent, e)),
        }
    }

    // Emit status change event
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        emit_status_change(&app_clone).await;
    });

    // If Dan was launched and we have a prompt, wait for Claude to be ready then send it
    if launched.contains(&"dan".to_string()) {
        if let Some(prompt) = effective_prompt {
            tokio::spawn(async move {
                // Wait for Claude to be ready (poll for status line indicator)
                let dan_session = "agent-dan";
                let max_attempts = 30; // 30 seconds max
                let poll_interval = std::time::Duration::from_secs(1);

                for _ in 0..max_attempts {
                    tokio::time::sleep(poll_interval).await;

                    // Check if Claude is ready by looking for the status line
                    let output = Command::new("tmux")
                        .args(&["capture-pane", "-t", dan_session, "-p", "-S", "-3"])
                        .output();

                    if let Ok(o) = output {
                        let content = String::from_utf8_lossy(&o.stdout);
                        // Claude is ready when we see the status line pattern (contains "|")
                        // or the input prompt (">")
                        if content.contains(" | ") || content.lines().any(|l| l.trim().starts_with(">")) {
                            // Small extra delay for UI to settle
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                            // Send the prompt to Dan
                            let _ = Command::new("tmux")
                                .args(&["send-keys", "-t", dan_session, "-l", &prompt])
                                .output();

                            // Small delay then send Enter
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                            let _ = Command::new("tmux")
                                .args(&["send-keys", "-t", dan_session, "C-m"])
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
    let mut killed = Vec::new();
    let mut not_running = Vec::new();
    let mut errors = Vec::new();

    for &agent in CORE_AGENTS {
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

    // Find next available instance number (with gap reuse)
    let instance_num = find_next_available_instance(&agent)?;
    let session = format!("agent-{}-{}", agent, instance_num);

    // Check if this session already exists (shouldn't happen, but safety check)
    if crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' already exists", session));
    }

    // Get paths using utility functions
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

    // Use provided model or default for agent
    let model_str = model.as_deref().unwrap_or_else(|| get_default_model(&agent));

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

    // Validate this is a core agent (not ralph - use spawn for ralph)
    if !CORE_AGENTS.contains(&agent.as_str()) {
        return Err(format!(
            "Cannot restart '{}' as core agent. Use spawn instead. Core agents: {:?}",
            agent, CORE_AGENTS
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

    // All core agents use sonnet
    let model = "sonnet";

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

    // Filter to agent-* sessions only
    let mut core_agents = Vec::new();
    let mut spawned_sessions = Vec::new();

    for session in sessions {
        if session.starts_with("agent-") {
            // Check if it's a core agent (agent-{name} without number)
            if let Some(caps) = RE_CORE_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if CORE_AGENTS.contains(&agent_name.as_str()) {
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
                        });
                    }
                }
            } else if let Some(caps) = RE_SPAWNED_AGENT.captures(&session) {
                let agent_name = caps[1].to_string();
                if VALID_AGENTS.contains(&agent_name.as_str()) {
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
                        });
                    }
                }
            }
        }
    }

    // Add inactive core agents (only core team, not ralph)
    for &agent in CORE_AGENTS {
        let session_name = format!("agent-{}", agent);
        if !core_agents.iter().any(|a| a.name == agent) {
            core_agents.push(AgentStatus {
                name: agent.to_string(),
                active: false,
                session: session_name,
                attached: false,
                context_usage: None,
                current_project: None,
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

    // Verify at least some core agents are running
    let sessions = crate::tmux::session::list_sessions()?;
    let core_agents = ["agent-ana", "agent-bill", "agent-carl", "agent-dan", "agent-enzo"];

    let mut opened = Vec::new();
    let mut errors = Vec::new();

    for session in &core_agents {
        if sessions.contains(&session.to_string()) {
            // Detach any existing clients from this session first
            // This closes existing terminal windows and prevents duplicates
            let _ = Command::new("tmux")
                .arg("detach-client")
                .arg("-s")
                .arg(session)
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
