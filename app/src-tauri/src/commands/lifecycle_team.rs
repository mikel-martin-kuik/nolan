//! lifecycle_team.rs
//!
//! Team lifecycle operations: launch, kill, and phase management.
//! Team agents belong to a specific team configuration.
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use crate::config::{get_pipeline_entrypoint_file, get_prompt_file, TeamConfig};
use crate::scheduler::executor::ExtraEnvVars;
use tauri::AppHandle;

use super::lifecycle_helpers::{
    detect_current_phase, determine_needed_agents, get_agent_cli_provider, get_default_model,
    get_team_active_project_file, register_session,
};

/// Get the active project DOCS_PATH from team context
/// Tries state file first, then falls back to reading project from running team member's statusline
pub fn get_docs_path_from_team_context(team_name: &str) -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    let projects_dir = crate::utils::paths::get_projects_dir()?;

    // Try to read team-namespaced state file first
    let state_file = get_team_active_project_file(team_name)?;
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
    let team = TeamConfig::load(team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    // Priority order: note-taker first (best context), then others
    let note_taker = team.note_taker();
    let mut agent_priority: Vec<&str> = Vec::new();
    if let Some(a) = note_taker {
        agent_priority.push(a);
    }
    agent_priority.extend(
        team.workflow_participants()
            .iter()
            .filter(|&&a| Some(a) != note_taker),
    );

    // Cached regex pattern for extracting project name from statusline
    let re_project_name = regex::Regex::new(r"\|\s+(\S+)\s*$").ok();

    for &agent_name in &agent_priority {
        // Team-scoped session naming
        let session = format!("agent-{}-{}", team_name, agent_name);
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
                if let Some(ref re) = re_project_name {
                    if let Some(caps) = re.captures(line) {
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
    }

    Err(format!(
        "No active team context found for team '{}'. Please launch the team with a project first.",
        team_name
    ))
}

/// Launch team agents with project context
///
/// Parameters:
/// - `initial_prompt`: For new projects - written to prompt file and sent to first phase owner
/// - `updated_original_prompt`: For existing projects - only written to prompt file if provided (meaning it was modified)
/// - `followup_prompt`: For existing projects - sent to note-taker to resume work
#[tauri::command(rename_all = "snake_case")]
pub async fn launch_team(
    app_handle: AppHandle,
    team_name: String,
    project_name: String,
    initial_prompt: Option<String>,
    updated_original_prompt: Option<String>,
    followup_prompt: Option<String>,
) -> Result<String, String> {
    use std::fs;
    use std::process::Command;

    // Load team config for specified team
    let team = TeamConfig::load(&team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    // Get paths using utility functions
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    // Team agents are in teams/{team}/agents/
    let agents_base = crate::utils::paths::get_team_agents_dir(&team_name)?;

    // Compute DOCS_PATH for the project
    let docs_path = projects_dir.join(&project_name);

    // Validate project directory exists
    if !docs_path.exists() {
        return Err(format!("Project directory does not exist: {:?}", docs_path));
    }

    // Write team state: store the active project for start_agent to inherit
    // Use team-namespaced state file
    let state_file = get_team_active_project_file(&team.team.name)?;
    fs::write(&state_file, docs_path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to write team state: {}", e))?;

    let nolan_root_str = nolan_root.to_string_lossy();
    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let nolan_data_root_str = nolan_data_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let docs_path_str = docs_path.to_string_lossy();

    // Create team pipeline for tracking workflow progress
    let team_pipeline_manager =
        crate::scheduler::team_pipeline::TeamPipelineManager::new(&nolan_data_root);

    // Only create pipeline for new projects or projects without active pipeline
    let pipeline_id = format!("{}-{}", team_name, project_name);
    let existing_pipeline = team_pipeline_manager.find_pipeline_by_project(&project_name);

    if initial_prompt.is_some() || existing_pipeline.map(|p| p.is_none()).unwrap_or(true) {
        match team_pipeline_manager.create_pipeline(
            &pipeline_id,
            &team,
            &project_name,
            &docs_path.to_string_lossy(),
        ) {
            Ok(pipeline) => {
                eprintln!(
                    "Created team pipeline: {} with {} stages",
                    pipeline.id,
                    pipeline.stages.len()
                );
            }
            Err(e) => {
                eprintln!("Warning: Failed to create team pipeline: {}", e);
                // Non-fatal - workflow continues without pipeline tracking
            }
        }
    }

    // Handle prompt file writing and determine what to send to Dan
    // prompt_file: Raw user input - only used by Layer 1 (starter) agents
    // spec_file: Structured specification - used by Layer 2 (structured) agents
    let prompt_filename = get_prompt_file();
    let prompt_file_path = docs_path.join(&prompt_filename);
    let entrypoint_file = get_pipeline_entrypoint_file();
    let spec_file = docs_path.join(&entrypoint_file);
    let effective_prompt: Option<String> = if let Some(ref prompt) = initial_prompt {
        // New project: write initial prompt to file and send to Dan
        // Add HANDOFF marker to indicate prompt has been initialized
        let now = chrono::Local::now();
        let timestamp = now.format("%Y-%m-%d %H:%M").to_string();
        let content = format!("{}\n\n<!-- HANDOFF:{}:user:COMPLETE -->", prompt, timestamp);
        fs::write(&prompt_file_path, &content)
            .map_err(|e| format!("Failed to write {}: {}", prompt_filename, e))?;
        Some(prompt.clone())
    } else {
        // Existing project case
        // If original prompt was modified, update the file
        if let Some(ref updated_prompt) = updated_original_prompt {
            // Add HANDOFF marker when updating existing prompt
            let now = chrono::Local::now();
            let timestamp = now.format("%Y-%m-%d %H:%M").to_string();
            let content = format!(
                "{}\n\n<!-- HANDOFF:{}:user:COMPLETE -->",
                updated_prompt, timestamp
            );
            fs::write(&prompt_file_path, &content)
                .map_err(|e| format!("Failed to update {}: {}", prompt_filename, e))?;
        }

        // If followup prompt provided, use it; otherwise check for entrypoint file auto-start
        if followup_prompt.is_some() {
            followup_prompt.clone()
        } else if spec_file.exists() {
            // Entrypoint file exists - generate auto-start prompt for first phase agent
            Some(format!("Please start working on this project. Review the {} file for the complete specification and requirements.", entrypoint_file))
        } else {
            None
        }
    };

    // Determine which agents to launch based on project phase status
    // For new projects (initial_prompt present), launch all agents
    // For existing projects, only launch agents needed for current/upcoming phases
    let agents_to_launch: Vec<String> = if initial_prompt.is_some() {
        // New project - launch all team agents
        team.agent_names().iter().map(|s| s.to_string()).collect()
    } else {
        // Existing project - determine needed agents from phase status
        determine_needed_agents(&docs_path, &team)
            .unwrap_or_else(|| team.agent_names().iter().map(|s| s.to_string()).collect())
    };

    let mut launched = Vec::new();
    let mut already_running = Vec::new();
    let mut errors = Vec::new();
    let mut skipped = Vec::new();

    for agent in team.agent_names() {
        // Skip agents not needed for current project phase
        if !agents_to_launch.contains(&agent.to_string()) {
            skipped.push(agent.to_string());
            continue;
        }

        // Team-scoped session naming: agent-{team}-{name}
        let session = format!("agent-{}-{}", team_name, agent);
        let agent_dir = agents_base.join(agent); // Shared agent directory
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

        // Get agent's model from agent.json
        let model = get_default_model(agent);

        // Get CLI provider for this agent
        let cli_provider_name = get_agent_cli_provider(agent, Some(&team_name));
        let cli_provider = crate::cli_providers::get_provider(cli_provider_name.as_deref(), true);
        let mapped_model = cli_provider.map_model(&model);

        // Get agent's output file from team config
        let output_file = team
            .get_agent(agent)
            .and_then(|a| a.output_file.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("");

        // Create tmux session with CLI provider - includes TEAM_NAME, DOCS_PATH, and OUTPUT_FILE
        let cmd = format!(
            "export AGENT_NAME={} TEAM_NAME=\"{}\" NOLAN_ROOT=\"{}\" NOLAN_DATA_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\" OUTPUT_FILE=\"{}\"; {} --dangerously-skip-permissions --model {}; sleep 0.5; tmux kill-session",
            agent, team_name, nolan_root_str, nolan_data_root_str, projects_dir_str, agent_dir_str, docs_path_str, output_file, cli_provider.executable(), mapped_model
        );

        let output = Command::new("tmux")
            .args(&[
                "new-session",
                "-d",
                "-s",
                &session,
                "-x",
                "200",
                "-y",
                "50",
                "-c",
                agent_dir_str.as_ref(),
                &cmd,
            ])
            .output();

        match output {
            Ok(o) if o.status.success() => {
                launched.push(agent.to_string());

                // Register session in the registry for history lookup (non-fatal)
                if let Err(e) =
                    register_session(&session, agent, agent_dir_str.as_ref(), &team_name)
                {
                    eprintln!("Warning: Failed to register session {}: {}", session, e);
                }
            }
            Ok(o) => errors.push(format!("{}: {}", agent, String::from_utf8_lossy(&o.stderr))),
            Err(e) => errors.push(format!("{}: {}", agent, e)),
        }
    }

    // Emit status change event
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        super::lifecycle::emit_status_change(&app_clone).await;
    });

    // Determine who should receive the initial prompt
    // Send to first incomplete phase owner (supports resume)
    if let Some(prompt) = effective_prompt {
        let target_agent: String;
        let target_session: String;
        let prompt_with_context: String;

        // Detect current phase and assign to appropriate owner
        // Check which phases are already complete to support resume
        let target_phase_index = detect_current_phase(&docs_path, &team).unwrap_or(0); // Default to first phase if all complete

        if let Some(target_phase) = team.get_phase(target_phase_index) {
            target_agent = target_phase.owner.clone();
            target_session = format!("agent-{}-{}", team_name, target_agent);
            prompt_with_context = format!("[Project: {}] {}", project_name, prompt);

            // Call assign.sh to formally assign the detected phase
            let assign_script = nolan_root.join("app").join("scripts").join("assign.sh");
            let phase_name = target_phase.name.clone();
            let project_name_clone = project_name.clone();
            let nolan_root_clone = nolan_root.clone();

            tokio::spawn(async move {
                // Small delay to let agents initialize
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                let _ = Command::new(&assign_script)
                    .env("NOLAN_ROOT", nolan_root_clone.to_string_lossy().to_string())
                    .args(&[
                        &project_name_clone,
                        &phase_name,
                        &format!("Phase assignment: {}", prompt),
                    ])
                    .output();
            });
        } else if let Some(fallback_agent) = team.note_taker() {
            // No phases defined, fall back to note-taker
            target_agent = fallback_agent.to_string();
            target_session = format!("agent-{}-{}", team_name, target_agent);
            prompt_with_context = format!("[Project: {}] {}", project_name, prompt);
        } else {
            // No phases and no note-taker - can't determine target agent
            eprintln!(
                "[Lifecycle] Warning: No phases and no note_taker configured, skipping prompt"
            );
            // Continue without sending prompt - agents were still launched
            return Ok(format!(
                "Launched: {}. Warning: No phases or note_taker configured, prompt not sent.",
                launched.join(", ")
            ));
        }

        // Only send prompt if target agent was launched
        if launched.contains(&target_agent) {
            tokio::spawn(async move {
                // Wait for Claude to be ready (poll for status line indicator)
                let max_attempts = 30; // 30 seconds max
                let poll_interval = std::time::Duration::from_secs(1);

                for _ in 0..max_attempts {
                    tokio::time::sleep(poll_interval).await;

                    // Check if Claude is ready by looking for the status line
                    let output = Command::new("tmux")
                        .args(&["capture-pane", "-t", &target_session, "-p", "-S", "-3"])
                        .output();

                    if let Ok(o) = output {
                        let content = String::from_utf8_lossy(&o.stdout);
                        // Claude is ready when we see the status line pattern (contains "|")
                        // or the input prompt (">")
                        if content.contains(" | ")
                            || content.lines().any(|l| l.trim().starts_with(">"))
                        {
                            // Small extra delay for UI to settle
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                            // Send the prompt to target agent
                            let _ = Command::new("tmux")
                                .args(&[
                                    "send-keys",
                                    "-t",
                                    &target_session,
                                    "-l",
                                    &prompt_with_context,
                                ])
                                .output();

                            // Small delay then send Enter
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                            let _ = Command::new("tmux")
                                .args(&["send-keys", "-t", &target_session, "C-m"])
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
        msg.push_str(&format!(
            "Launched: {} (project: {})",
            launched.join(", "),
            project_name
        ));
    }
    if !already_running.is_empty() {
        if !msg.is_empty() {
            msg.push_str(". ");
        }
        msg.push_str(&format!("Already running: {}", already_running.join(", ")));
    }
    if !skipped.is_empty() {
        if !msg.is_empty() {
            msg.push_str(". ");
        }
        msg.push_str(&format!(
            "Skipped (not needed for current phase): {}",
            skipped.join(", ")
        ));
    }
    if !errors.is_empty() {
        if !msg.is_empty() {
            msg.push_str(". ");
        }
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

/// Called when a phase completes (HANDOFF marker detected)
/// Updates the team pipeline and triggers validator
#[tauri::command(rename_all = "snake_case")]
pub async fn on_phase_complete(
    _app_handle: AppHandle,
    team_name: String,
    project_name: String,
    phase_name: String,
    _agent_name: String,
) -> Result<String, String> {
    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let manager = crate::scheduler::team_pipeline::TeamPipelineManager::new(&nolan_data_root);

    // Find active pipeline for this project
    let pipeline_id = format!("{}-{}", team_name, project_name);

    // Update execution stage to success
    let pipeline = manager.update_stage(
        &pipeline_id,
        &phase_name,
        crate::scheduler::types::TeamPipelineStageType::PhaseExecution,
        crate::scheduler::types::PipelineStageStatus::Success,
        None,
        None,
    )?;

    // Get next action
    if let Some(action) = manager.get_next_action(&pipeline) {
        match action {
            crate::scheduler::types::TeamPipelineNextAction::TriggerValidator {
                phase_name,
                output_file,
            } => {
                eprintln!(
                    "Triggering validator for phase: {} output: {}",
                    phase_name, output_file
                );

                // Build environment variables for the phase validator
                let mut env_vars = ExtraEnvVars::new();
                env_vars.insert("DOCS_PATH".to_string(), pipeline.docs_path.clone());
                env_vars.insert("PHASE_NAME".to_string(), phase_name.clone());
                env_vars.insert("OUTPUT_FILE".to_string(), output_file.clone());
                env_vars.insert("TEAM_PIPELINE_ID".to_string(), pipeline_id.clone());

                // Load team config to get required sections
                if let Ok(team_config) = TeamConfig::load(&team_name) {
                    // Get agent config for required sections
                    if let Some(agent_config) = team_config
                        .team
                        .agents
                        .iter()
                        .find(|a| a.output_file.as_deref() == Some(&output_file))
                    {
                        let sections = agent_config.required_sections.clone();
                        if !sections.is_empty() {
                            env_vars.insert("REQUIRED_SECTIONS".to_string(), sections.join(","));
                        }
                    }
                }

                // Trigger the phase-validator via ScheduleConfig
                tokio::spawn(async move {
                    if let Err(e) = trigger_phase_validator(env_vars).await {
                        eprintln!("Failed to trigger phase validator: {}", e);
                    }
                });

                Ok(format!(
                    "Phase {} complete, validator triggered for {}",
                    phase_name, output_file
                ))
            }
            crate::scheduler::types::TeamPipelineNextAction::TriggerNextPhase {
                phase_name,
                agent_name,
            } => {
                eprintln!(
                    "Phase complete, next phase: {} owner: {}",
                    phase_name, agent_name
                );
                Ok(format!(
                    "Phase complete, triggering next phase: {}",
                    phase_name
                ))
            }
            crate::scheduler::types::TeamPipelineNextAction::Complete => {
                eprintln!("All phases complete for pipeline: {}", pipeline_id);
                Ok("All phases complete".to_string())
            }
            _ => Ok(format!("Phase {} complete", phase_name)),
        }
    } else {
        Ok(format!("Phase {} complete", phase_name))
    }
}

/// Trigger the phase-validator agent with environment variables
async fn trigger_phase_validator(env_vars: ExtraEnvVars) -> Result<(), String> {
    use crate::scheduler::commands::SCHEDULER;
    use crate::scheduler::executor;
    use crate::scheduler::types::RunTrigger;

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    // Get the phase-validator config
    let config = manager
        .get_agent("phase-validator")
        .await
        .map_err(|e| format!("Phase validator agent not found: {}", e))?;

    // Execute with environment variables
    let run_log = executor::execute_cron_agent_with_env(
        &config,
        manager,
        RunTrigger::Manual,
        false, // not dry_run
        None,  // no output_sender
        None,  // no cancellation
        Some(env_vars),
        Some("phase-validation".to_string()),
    )
    .await?;

    eprintln!(
        "Phase validator completed with status: {:?}",
        run_log.status
    );
    Ok(())
}

/// Kill all team agents (requires user confirmation in frontend)
#[tauri::command(rename_all = "snake_case")]
pub async fn kill_team(app_handle: AppHandle, team_name: String) -> Result<String, String> {
    // Load team config for specified team
    let team = TeamConfig::load(&team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    let mut killed = Vec::new();
    let mut not_running = Vec::new();
    let mut errors = Vec::new();

    for agent in team.agent_names() {
        // Team-scoped session naming: agent-{team}-{name}
        let session = format!("agent-{}-{}", team_name, agent);

        match crate::tmux::session::session_exists(&session) {
            Ok(true) => match crate::tmux::session::kill_session(&session) {
                Ok(_) => killed.push(agent.to_string()),
                Err(e) => errors.push(format!("{}: {}", agent, e)),
            },
            Ok(false) => not_running.push(agent.to_string()),
            Err(e) => errors.push(format!("{}: {}", agent, e)),
        }
    }

    // Clear active project to prevent stale recovery
    if let Err(e) = crate::commands::lifecycle_core::clear_team_active_project(&team_name) {
        eprintln!(
            "Warning: Failed to clear active project for team '{}': {}",
            team_name, e
        );
        // Non-fatal - sessions are still killed
    }

    // Emit status change event after operation
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        super::lifecycle::emit_status_change(&app_clone).await;
    });

    // Build result message
    let mut msg = String::new();
    if !killed.is_empty() {
        msg.push_str(&format!("Killed: {}", killed.join(", ")));
    }
    if !not_running.is_empty() {
        if !msg.is_empty() {
            msg.push_str(". ");
        }
        msg.push_str(&format!("Not running: {}", not_running.join(", ")));
    }
    if !errors.is_empty() {
        if !msg.is_empty() {
            msg.push_str(". ");
        }
        msg.push_str(&format!("Errors: {}", errors.join("; ")));
    }

    if msg.is_empty() {
        msg = "No team agents to kill".to_string();
    }

    if errors.is_empty() {
        Ok(msg)
    } else {
        Err(msg)
    }
}

/// Start a team agent (creates team-scoped session: agent-{team}-{name})
/// Each team agent has exactly one session per team.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_agent(
    app_handle: AppHandle,
    team_name: String,
    agent: String,
) -> Result<String, String> {
    use std::process::Command;

    // Load team config for specified team
    let team = TeamConfig::load(&team_name)
        .map_err(|e| format!("Failed to load team config '{}': {}", team_name, e))?;

    // Validate agent is in team config
    let team_agents = team.agent_names();
    if !team_agents.contains(&agent.as_str()) {
        return Err(format!(
            "Agent '{}' not found in team '{}'. Available agents: {:?}",
            agent, team_name, team_agents
        ));
    }

    // Team-scoped session naming
    let session = format!("agent-{}-{}", team_name, agent);

    // Check if session already exists
    if crate::tmux::session::session_exists(&session)? {
        return Err(format!(
            "Agent '{}' in team '{}' is already running. Kill it first or use spawn_agent to create additional instances.",
            agent, team_name
        ));
    }

    // Get paths using utility functions (handles path detection properly)
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let projects_dir = crate::utils::paths::get_projects_dir()?;
    // Team agents are in teams/{team}/agents/{agent}/
    let agent_dir = crate::utils::paths::get_team_agents_dir(&team_name)?.join(&agent);

    // Verify agent directory exists
    if !agent_dir.exists() {
        return Err(format!("Agent directory not found: {:?}", agent_dir));
    }

    // Convert paths to strings for command
    let nolan_root_str = nolan_root.to_string_lossy();
    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let nolan_data_root_str = nolan_data_root.to_string_lossy();
    let projects_dir_str = projects_dir.to_string_lossy();
    let agent_dir_str = agent_dir.to_string_lossy();

    // Inherit DOCS_PATH from active team to rejoin the project
    let docs_path = get_docs_path_from_team_context(&team_name)?;

    // Get agent's model from agent.json
    let model = get_default_model(&agent);

    // Get CLI provider for this agent
    let cli_provider_name = get_agent_cli_provider(&agent, Some(&team_name));
    let cli_provider = crate::cli_providers::get_provider(cli_provider_name.as_deref(), true);
    let mapped_model = cli_provider.map_model(&model);

    // Get agent's output file from team config
    let output_file = team
        .get_agent(&agent)
        .and_then(|a| a.output_file.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("");

    // Create tmux session with inherited project context - includes TEAM_NAME and OUTPUT_FILE
    let cmd = format!(
        "export AGENT_NAME={} TEAM_NAME=\"{}\" NOLAN_ROOT=\"{}\" NOLAN_DATA_ROOT=\"{}\" PROJECTS_DIR=\"{}\" AGENT_DIR=\"{}\" DOCS_PATH=\"{}\" OUTPUT_FILE=\"{}\"; {} --dangerously-skip-permissions --model {}; sleep 0.5; tmux kill-session",
        agent, team_name, nolan_root_str, nolan_data_root_str, projects_dir_str, agent_dir_str, docs_path, output_file, cli_provider.executable(), mapped_model
    );

    let output = Command::new("tmux")
        .args(&[
            "new-session",
            "-d",
            "-s",
            &session,
            "-x",
            "200",
            "-y",
            "50",
            "-c",
            agent_dir_str.as_ref(),
            &cmd,
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to start core agent session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register session in the registry for history lookup (non-fatal)
    if let Err(e) = register_session(&session, &agent, agent_dir_str.as_ref(), &team_name) {
        eprintln!("Warning: Failed to register session {}: {}", session, e);
    }

    // Emit status change event after successful restart
    let app_clone = app_handle.clone();
    tokio::spawn(async move {
        super::lifecycle::emit_status_change(&app_clone).await;
    });

    Ok(format!("Started agent: {}", session))
}
