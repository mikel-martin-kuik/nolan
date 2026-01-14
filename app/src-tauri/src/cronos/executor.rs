use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, RwLock};
use tokio::time::{timeout, Duration};
use chrono::Utc;
use uuid::Uuid;
use serde::Deserialize;

use super::types::*;
use super::manager::CronosManager;
use crate::cli_providers::{self, CliSpawnConfig, OutputFormat};
use crate::utils::paths;
use crate::tmux::session;
use crate::git::worktree;

/// Extract total cost from Claude output log file
/// The cost is in a JSON line with type: "result" and total_cost_usd field
fn extract_cost_from_log(log_file: &PathBuf) -> Option<f32> {
    extract_cost_from_log_file(&log_file.to_string_lossy())
}

/// Extract total cost from Claude output log file (public, takes string path)
/// The cost is in a JSON line with type: "result" and total_cost_usd field
pub fn extract_cost_from_log_file(log_path: &str) -> Option<f32> {
    let content = std::fs::read_to_string(log_path).ok()?;

    // Parse each line looking for result entry
    #[derive(Deserialize)]
    struct ResultEntry {
        #[serde(rename = "type")]
        entry_type: String,
        total_cost_usd: Option<f32>,
    }

    for line in content.lines().rev() {  // Search from end (result is last)
        if let Ok(entry) = serde_json::from_str::<ResultEntry>(line) {
            if entry.entry_type == "result" {
                return entry.total_cost_usd;
            }
        }
    }

    None
}

// CancellationToken is now defined in types.rs

/// Output event sender for real-time streaming
pub type OutputSender = broadcast::Sender<CronOutputEvent>;

/// Extra environment variables to pass to cron agents
pub type ExtraEnvVars = std::collections::HashMap<String, String>;

/// Execute a cron agent with full feature support
///
/// Features:
/// - Real-time output streaming via broadcast channel
/// - Concurrency control (skip or queue if already running)
/// - Retry logic with exponential backoff
/// - Cancellation support
/// - Persistent state tracking
/// - Extra environment variables (e.g., IDEA_ID for parameterized runs)
pub async fn execute_cron_agent(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
) -> Result<CronRunLog, String> {
    execute_cron_agent_with_env(config, manager, trigger, dry_run, output_sender, cancellation, None, None).await
}

/// Execute a cron agent with extra environment variables and optional label
pub async fn execute_cron_agent_with_env(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
    extra_env: Option<ExtraEnvVars>,
    label: Option<String>,
) -> Result<CronRunLog, String> {
    // Check concurrency
    if !config.concurrency.allow_parallel && manager.is_running(&config.name).await {
        let now = Utc::now();
        let timestamp = now.format("%H%M%S").to_string();
        let uuid_suffix = Uuid::new_v4().to_string()[..7].to_string();
        let run_id = format!("{}-{}", timestamp, uuid_suffix);

        // Log skipped run
        let skip_log = CronRunLog {
            run_id: run_id.clone(),
            agent_name: config.name.clone(),
            started_at: now.to_rfc3339(),
            completed_at: Some(now.to_rfc3339()),
            status: CronRunStatus::Skipped,
            duration_secs: Some(0),
            exit_code: None,
            output_file: String::new(),
            error: Some("Skipped: agent already running".to_string()),
            attempt: 1,
            trigger: trigger.clone(),
            session_name: None,
            run_dir: None,
            claude_session_id: None,
            total_cost_usd: None,
            worktree_path: None,
            worktree_branch: None,
            base_commit: None,
            label: None,
            analyzer_verdict: None,
            pipeline_id: None,
            parent_run_id: None,
        };

        // Emit skip event
        if let Some(ref sender) = output_sender {
            let _ = sender.send(CronOutputEvent {
                run_id: run_id.clone(),
                agent_name: config.name.clone(),
                event_type: OutputEventType::Status,
                content: "Run skipped - agent already running".to_string(),
                timestamp: now.to_rfc3339(),
            });
        }

        return Ok(skip_log);
    }

    // Execute with retry support
    let mut attempt = 1;
    let max_attempts = if config.retry.enabled { config.retry.max_retries + 1 } else { 1 };

    loop {
        let result = execute_single_run(
            config,
            manager,
            trigger.clone(),
            attempt,
            dry_run,
            output_sender.clone(),
            cancellation.clone(),
            extra_env.clone(),
            label.clone(),
        ).await;

        match &result {
            Ok(log) if log.status == CronRunStatus::Failed && config.retry.enabled && attempt < max_attempts => {
                // Schedule retry
                let delay = if config.retry.exponential_backoff {
                    config.retry.delay_secs * 2u32.pow(attempt - 1)
                } else {
                    config.retry.delay_secs
                };

                // Emit retry event
                if let Some(ref sender) = output_sender {
                    let _ = sender.send(CronOutputEvent {
                        run_id: log.run_id.clone(),
                        agent_name: config.name.clone(),
                        event_type: OutputEventType::Status,
                        content: format!("Retrying in {} seconds (attempt {}/{})", delay, attempt + 1, max_attempts),
                        timestamp: Utc::now().to_rfc3339(),
                    });
                }

                tokio::time::sleep(Duration::from_secs(delay as u64)).await;
                attempt += 1;
                continue;
            }
            _ => {
                // Update persistent state
                if let Ok(ref log) = result {
                    let _ = manager.update_agent_state(
                        &config.name,
                        Some(log.status.clone()),
                        None,
                    ).await;
                }
                return result;
            }
        }
    }
}

/// Execute a single run attempt using tmux for persistence
///
/// This implementation runs Claude in a tmux session so the process continues
/// independently of the Nolan app. If the app restarts, the session can be recovered.
async fn execute_single_run(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    attempt: u32,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
    extra_env: Option<ExtraEnvVars>,
    label: Option<String>,
) -> Result<CronRunLog, String> {
    let started_at = Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();
    let uuid_suffix = Uuid::new_v4().to_string()[..7].to_string();

    // Run ID format depends on whether a label is provided:
    // - With label: "my-feature-abc1234" (label + uuid for uniqueness)
    // - Without label: "143022-abc1234" (timestamp + uuid for identification)
    let run_id = if let Some(ref lbl) = label {
        // Sanitize label: lowercase, replace spaces/special chars with hyphens, truncate
        let sanitized = lbl
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string();
        let truncated = if sanitized.len() > 30 { &sanitized[..30] } else { &sanitized };
        format!("{}-{}", truncated.trim_end_matches('-'), uuid_suffix)
    } else {
        format!("{}-{}", timestamp, uuid_suffix)
    };

    // Setup paths
    let nolan_root = paths::get_nolan_root()?;
    let nolan_data_root = paths::get_nolan_data_root()?;
    let cronos_runs_dir = paths::get_cronos_runs_dir()?;
    let runs_dir = cronos_runs_dir.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, &run_id));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, &run_id));

    // Create ephemeral run directory (like Ralph's agent-ralph-{name}/)
    let run_dir = runs_dir.join(format!("{}-{}", config.name, run_id));
    std::fs::create_dir_all(&run_dir)
        .map_err(|e| format!("Failed to create run directory: {}", e))?;

    // Symlink .claude to app root for Claude Code settings
    #[cfg(unix)]
    {
        let claude_link = run_dir.join(".claude");
        if !claude_link.exists() {
            let _ = std::os::unix::fs::symlink(nolan_root.join(".claude"), &claude_link);
        }
    }

    // Generate tmux session name
    let session_name = format!("cron-{}-{}", config.name, &run_id);

    // Generate Claude session ID for --resume capability
    let claude_session_id = Uuid::new_v4().to_string();

    // Create or use cancellation token (needed for cancel_cron_agent to signal cancellation)
    let cancel_token = cancellation.unwrap_or_else(|| Arc::new(RwLock::new(false)));

    // Emit start event
    if let Some(ref sender) = output_sender {
        let _ = sender.send(CronOutputEvent {
            run_id: run_id.clone(),
            agent_name: config.name.clone(),
            event_type: OutputEventType::Status,
            content: format!("Starting {} in tmux session {} (attempt {})", config.name, session_name, attempt),
            timestamp: started_at.to_rfc3339(),
        });
    }

    // Read agent's CLAUDE.md for prompt
    let agent_dir = paths::get_agents_dir()?.join(&config.name);
    let claude_md_path = agent_dir.join("CLAUDE.md");
    let prompt = std::fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md from {:?}: {}", claude_md_path, e))?;

    // For dry run, just validate
    if dry_run {
        // Cleanup the run directory we created
        let _ = std::fs::remove_dir_all(&run_dir);
        return Ok(CronRunLog {
            run_id,
            agent_name: config.name.clone(),
            started_at: started_at.to_rfc3339(),
            completed_at: Some(Utc::now().to_rfc3339()),
            status: CronRunStatus::Success,
            duration_secs: Some(0),
            exit_code: Some(0),
            output_file: "[dry run - no output]".to_string(),
            error: None,
            attempt,
            trigger,
            session_name: None,
            run_dir: None,
            claude_session_id: None,
            total_cost_usd: None,
            worktree_path: None,
            worktree_branch: None,
            base_commit: None,
            label,
            analyzer_verdict: None,
            pipeline_id: None,
            parent_run_id: None,
        });
    }

    // Get CLI provider for this agent (defaults to "claude" if not specified)
    let cli_provider = cli_providers::get_provider(config.cli_provider.as_deref(), true);

    // Build guardrail system prompt
    let system_prompt_append = config.guardrails.forbidden_paths.as_ref().map(|forbidden| {
        format!(
            "CRITICAL GUARDRAILS:\n- NEVER access these paths: {}\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        )
    });

    // Build shell command that:
    // 1. Sets environment variables
    // 2. Runs claude with output redirected to log file (with --session-id for relaunch)
    // 3. Captures exit code
    // 4. Keeps shell alive briefly for debugging (exec bash at end)

    // Git worktree isolation setup
    let (work_dir, worktree_info) = if let Some(ref wt_config) = config.worktree {
        if wt_config.enabled {
            // Determine repo path - either from config or working_directory or nolan_root
            let repo_path = wt_config.repo_path.as_ref()
                .map(PathBuf::from)
                .or_else(|| config.context.working_directory.as_ref().map(PathBuf::from))
                .unwrap_or_else(|| nolan_root.clone());

            // Verify it's a git repository
            if let Some(git_root) = worktree::detect_git_root(&repo_path) {
                // Generate unique branch name
                let branch_name = worktree::generate_branch_name(&config.name, &run_id);

                // Create worktree in data directory
                let worktrees_dir = worktree::get_worktrees_dir()
                    .map_err(|e| format!("Failed to get worktrees directory: {}", e))?;
                let worktree_path = worktrees_dir.join(&config.name).join(&run_id);

                // Create the worktree
                match worktree::create_worktree(
                    &git_root,
                    &worktree_path,
                    &branch_name,
                    wt_config.base_branch.as_deref(),
                ) {
                    Ok(base_commit) => {
                        // Emit status event about worktree creation
                        if let Some(ref sender) = output_sender {
                            let _ = sender.send(CronOutputEvent {
                                run_id: run_id.clone(),
                                agent_name: config.name.clone(),
                                event_type: OutputEventType::Status,
                                content: format!("Created worktree: {} (branch: {})", worktree_path.display(), branch_name),
                                timestamp: Utc::now().to_rfc3339(),
                            });
                        }

                        (worktree_path.clone(), Some((worktree_path, branch_name, base_commit)))
                    }
                    Err(e) => {
                        // Log warning but continue without worktree
                        eprintln!("[Cronos] Warning: Failed to create worktree for {}: {}", config.name, e);
                        if let Some(ref sender) = output_sender {
                            let _ = sender.send(CronOutputEvent {
                                run_id: run_id.clone(),
                                agent_name: config.name.clone(),
                                event_type: OutputEventType::Status,
                                content: format!("Warning: Running without worktree isolation: {}", e),
                                timestamp: Utc::now().to_rfc3339(),
                            });
                        }
                        let fallback = config.context.working_directory.as_ref()
                            .map(PathBuf::from)
                            .unwrap_or_else(|| nolan_root.clone());
                        (fallback, None)
                    }
                }
            } else {
                // Not a git repo, fall back to normal working directory
                let fallback = config.context.working_directory.as_ref()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| nolan_root.clone());
                (fallback, None)
            }
        } else {
            // Worktree config exists but disabled
            let fallback = config.context.working_directory.as_ref()
                .map(PathBuf::from)
                .unwrap_or_else(|| nolan_root.clone());
            (fallback, None)
        }
    } else {
        // No worktree config
        let fallback = config.context.working_directory.as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| nolan_root.clone());
        (fallback, None)
    };

    // Build environment variable exports
    // AGENT_WORK_ROOT is set to worktree path if using worktree, otherwise the working directory
    // AGENT_DIR points to the cron agent's configuration directory
    let agent_dir = paths::get_agents_dir()?.join(&config.name);
    let agent_work_root = work_dir.to_string_lossy().to_string();
    let mut env_exports = format!("export CRON_RUN_ID='{}' CRON_AGENT='{}' NOLAN_ROOT='{}' NOLAN_DATA_ROOT='{}' AGENT_WORK_ROOT='{}' AGENT_DIR='{}'",
        run_id, config.name, nolan_root.to_string_lossy(), nolan_data_root.to_string_lossy(),
        agent_work_root, agent_dir.to_string_lossy());

    // Add extra environment variables (e.g., IDEA_ID for parameterized runs)
    if let Some(ref extra) = extra_env {
        for (key, value) in extra {
            env_exports.push_str(&format!(" {}='{}'", key, value.replace("'", "'\\''")));
        }
    }

    let mut cmd_parts = vec![env_exports];

    // Change to working directory
    cmd_parts.push(format!("cd '{}'", work_dir.to_string_lossy()));

    // Build CLI spawn configuration
    let mut spawn_env = std::collections::HashMap::new();
    spawn_env.insert("CRON_RUN_ID".to_string(), run_id.clone());
    spawn_env.insert("CRON_AGENT".to_string(), config.name.clone());
    spawn_env.insert("NOLAN_ROOT".to_string(), nolan_root.to_string_lossy().to_string());
    spawn_env.insert("NOLAN_DATA_ROOT".to_string(), nolan_data_root.to_string_lossy().to_string());
    spawn_env.insert("AGENT_WORK_ROOT".to_string(), agent_work_root.clone());
    spawn_env.insert("AGENT_DIR".to_string(), agent_dir.to_string_lossy().to_string());

    // Add extra env vars
    if let Some(ref extra) = extra_env {
        for (key, value) in extra {
            spawn_env.insert(key.clone(), value.clone());
        }
    }

    let spawn_config = CliSpawnConfig {
        prompt: prompt.clone(),
        model: config.model.clone(),
        working_dir: work_dir.clone(),
        session_id: Some(claude_session_id.clone()),
        resume: false,
        output_format: OutputFormat::StreamJson,
        allowed_tools: config.guardrails.allowed_tools.clone(),
        system_prompt_append: system_prompt_append.clone(),
        skip_permissions: true,
        verbose: true,
        env_vars: spawn_env,
    };

    // Build CLI command using the provider
    let cli_cmd = cli_provider.build_command(&spawn_config);

    // Run CLI with output to both terminal (for live streaming) and file
    // Use tee so tmux pipe-pane can capture the live output
    cmd_parts.push(format!("{} 2>&1 | tee '{}'", cli_cmd, log_file.to_string_lossy()));

    // Capture claude's exit code using PIPESTATUS (requires bash)
    // PIPESTATUS[0] is the exit code of the command before the pipe
    let exit_code_file = run_dir.join("exit_code");
    cmd_parts.push(format!("echo ${{PIPESTATUS[0]}} > '{}'", exit_code_file.to_string_lossy()));

    let shell_cmd = cmd_parts.join("; ");

    // Extract worktree info for logging
    // If no worktree was created, check for inherited worktree info from parent run (for analyzer runs)
    let (wt_path, wt_branch, wt_commit) = match &worktree_info {
        Some((path, branch, commit)) => (
            Some(path.to_string_lossy().to_string()),
            Some(branch.clone()),
            Some(commit.clone()),
        ),
        None => {
            // Fall back to inherited worktree info from parent run (e.g., for analyzer runs)
            let inherited_path = extra_env.as_ref().and_then(|e| e.get("ANALYZED_WORKTREE_PATH").cloned());
            let inherited_branch = extra_env.as_ref().and_then(|e| e.get("ANALYZED_WORKTREE_BRANCH").cloned());
            let inherited_commit = extra_env.as_ref().and_then(|e| e.get("ANALYZED_BASE_COMMIT").cloned());
            (inherited_path, inherited_branch, inherited_commit)
        }
    };

    // Write initial run log (marks as running for recovery)
    let initial_log = CronRunLog {
        run_id: run_id.clone(),
        agent_name: config.name.clone(),
        started_at: started_at.to_rfc3339(),
        completed_at: None,  // Marks as running
        status: CronRunStatus::Running,
        duration_secs: None,
        exit_code: None,
        output_file: log_file.to_string_lossy().to_string(),
        error: None,
        attempt,
        trigger: trigger.clone(),
        session_name: Some(session_name.clone()),
        run_dir: Some(run_dir.to_string_lossy().to_string()),
        claude_session_id: Some(claude_session_id.clone()),
        total_cost_usd: None,
        worktree_path: wt_path.clone(),
        worktree_branch: wt_branch.clone(),
        base_commit: wt_commit.clone(),
        label: label.clone(),
        analyzer_verdict: None,
        pipeline_id: None,
        parent_run_id: extra_env.as_ref().and_then(|e| e.get("ANALYZED_RUN_ID").cloned()),
    };

    let json = serde_json::to_string_pretty(&initial_log)
        .map_err(|e| format!("Failed to serialize initial run log: {}", e))?;
    std::fs::write(&json_file, &json)
        .map_err(|e| format!("Failed to write initial run log: {}", e))?;

    // Create tmux session with explicit bash to ensure PIPESTATUS works
    // We use "bash -c" to run our command, guaranteeing bash features are available
    let output = std::process::Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &session_name,
            "-c", &run_dir.to_string_lossy(),
            "bash", "-c", &shell_cmd
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        // Cleanup and return error
        let _ = std::fs::remove_dir_all(&run_dir);
        return Err(format!(
            "Failed to start tmux session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Register in session registry for recovery
    if let Err(e) = crate::commands::lifecycle::register_session(
        &session_name,
        &config.name,
        &run_dir.to_string_lossy(),
        "",  // no team
    ) {
        eprintln!("Warning: Failed to register cron session: {}", e);
    }

    // Register as running in manager (with cancellation token for cancel_cron_agent)
    manager.register_running_with_worktree(
        &run_id,
        &config.name,
        None,  // PID not directly available from tmux
        log_file.clone(),
        json_file.clone(),
        Some(session_name.clone()),
        Some(run_dir.clone()),
        Some(cancel_token.clone()),
        worktree_info.as_ref().map(|(p, _, _)| p.clone()),
        worktree_info.as_ref().map(|(_, b, _)| b.clone()),
        worktree_info.as_ref().map(|(_, _, c)| c.clone()),
        Some(claude_session_id.clone()),
    ).await;

    // Wait for completion with timeout and cancellation
    let timeout_duration = Duration::from_secs(config.timeout as u64);
    let result = wait_for_tmux_completion(
        &session_name,
        &run_dir,
        timeout_duration,
        Some(cancel_token.clone()),
    ).await;

    // Unregister from running
    manager.unregister_running(&config.name).await;

    let (status, exit_code, error) = match result {
        TmuxWaitResult::Completed => {
            // Read exit code from file
            let exit_code_file = run_dir.join("exit_code");
            let code = std::fs::read_to_string(&exit_code_file)
                .ok()
                .and_then(|s| s.trim().parse::<i32>().ok());

            if code == Some(0) {
                (CronRunStatus::Success, code, None)
            } else {
                (CronRunStatus::Failed, code, Some("Non-zero exit code".to_string()))
            }
        }
        TmuxWaitResult::Timeout => {
            // Kill the tmux session
            let _ = std::process::Command::new("tmux")
                .args(&["kill-session", "-t", &session_name])
                .output();
            (CronRunStatus::Timeout, None, Some(format!("Timeout after {}s", config.timeout)))
        }
        TmuxWaitResult::Cancelled => {
            // Kill the tmux session
            let _ = std::process::Command::new("tmux")
                .args(&["kill-session", "-t", &session_name])
                .output();
            (CronRunStatus::Cancelled, None, Some("Cancelled by user".to_string()))
        }
    };

    let completed_at = Utc::now();
    let duration = (completed_at - started_at).num_seconds() as u32;

    // Extract cost from output log using the CLI provider's parser
    let cli_result = cli_provider.parse_output(&log_file.to_string_lossy());
    let total_cost_usd = cli_result.total_cost_usd.or_else(|| extract_cost_from_log(&log_file));

    let run_log = CronRunLog {
        run_id: run_id.clone(),
        agent_name: config.name.clone(),
        started_at: started_at.to_rfc3339(),
        completed_at: Some(completed_at.to_rfc3339()),
        status: status.clone(),
        duration_secs: Some(duration),
        exit_code,
        output_file: log_file.to_string_lossy().to_string(),
        error,
        attempt,
        trigger,
        session_name: Some(session_name.clone()),
        run_dir: Some(run_dir.to_string_lossy().to_string()),
        claude_session_id: Some(claude_session_id.clone()),
        total_cost_usd,
        worktree_path: wt_path,
        worktree_branch: wt_branch,
        base_commit: wt_commit,
        label,
        analyzer_verdict: None,
        pipeline_id: None,
        parent_run_id: extra_env.as_ref().and_then(|e| e.get("ANALYZED_RUN_ID").cloned()),
    };

    // Write final JSON log
    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    // Emit completion event
    if let Some(ref sender) = output_sender {
        let _ = sender.send(CronOutputEvent {
            run_id: run_id.clone(),
            agent_name: config.name.clone(),
            event_type: OutputEventType::Complete,
            content: format!("Completed with status: {:?}", status),
            timestamp: completed_at.to_rfc3339(),
        });
    }

    // Cleanup ephemeral directory on successful completion
    // Keep it on failure for debugging
    if status == CronRunStatus::Success {
        let _ = std::fs::remove_dir_all(&run_dir);
        // Note: Worktrees are NOT cleaned up automatically - they remain for QA/merge workflow
        // Worktree cleanup is handled by the merge agent or manual cleanup
    }

    Ok(run_log)
}

/// Result of waiting for tmux session completion
enum TmuxWaitResult {
    Completed,
    Timeout,
    Cancelled,
}

/// Wait for a tmux session to complete, with timeout and cancellation support
async fn wait_for_tmux_completion(
    session_name: &str,
    run_dir: &PathBuf,
    timeout_duration: Duration,
    cancellation: Option<CancellationToken>,
) -> TmuxWaitResult {
    let check_interval = Duration::from_secs(2);
    let start = std::time::Instant::now();

    loop {
        // Check cancellation first
        if let Some(ref token) = cancellation {
            if *token.read().await {
                return TmuxWaitResult::Cancelled;
            }
        }

        // Check for exit_code file FIRST - this is the most reliable completion signal
        // The shell writes this file after Claude exits, before the tmux session ends
        if run_dir.join("exit_code").exists() {
            // Process wrote exit code - job completed naturally
            tokio::time::sleep(Duration::from_millis(200)).await;
            return TmuxWaitResult::Completed;
        }

        // Check if session still exists
        match session::session_exists(session_name) {
            Ok(false) => {
                // Session ended - wait briefly for exit_code file to be written
                tokio::time::sleep(Duration::from_millis(500)).await;
                return TmuxWaitResult::Completed;
            }
            Ok(true) => {
                // Still running, continue to timeout check
            }
            Err(_) => {
                // Error checking session, assume it ended
                tokio::time::sleep(Duration::from_millis(500)).await;
                return TmuxWaitResult::Completed;
            }
        }

        // Check timeout AFTER checking for completion
        // This ensures we don't timeout a job that just completed
        if start.elapsed() > timeout_duration {
            return TmuxWaitResult::Timeout;
        }

        tokio::time::sleep(check_interval).await;
    }
}

/// Cancel a running cron agent by killing its tmux session
pub async fn cancel_cron_agent(manager: &CronosManager, agent_name: &str) -> Result<(), String> {
    let process = manager.get_running_process(agent_name).await
        .ok_or_else(|| format!("Agent '{}' is not running", agent_name))?;

    // CRITICAL: Set the cancellation token BEFORE killing tmux session
    // This ensures wait_for_tmux_completion sees the cancel signal first
    // and returns Cancelled instead of Completed (which would trigger retry)
    if let Some(ref token) = process.cancellation_token {
        let mut cancelled = token.write().await;
        *cancelled = true;
    }

    // Kill the tmux session
    if let Some(ref session_name) = process.session_name {
        let _ = std::process::Command::new("tmux")
            .args(&["kill-session", "-t", session_name])
            .output();
    } else if let Some(pid) = process.pid {
        // Fallback: kill by PID if no session (legacy support)
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .output();
        }
    }

    // Note: The execution loop (execute_single_run) will handle:
    // - Writing the final JSON with Cancelled status
    // - Cleaning up the run directory
    // - Unregistering from running processes
    // This avoids race conditions where both cancel and execution loop
    // try to write to the same JSON file.

    Ok(())
}

/// Simple execution without manager (for backwards compatibility)
pub async fn execute_cron_agent_simple(
    config: &CronAgentConfig,
    dry_run: bool,
) -> Result<CronRunLog, String> {
    let started_at = Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();
    // Run ID includes timestamp for human-readable identification (e.g., "143022-abc1234")
    let uuid_suffix = Uuid::new_v4().to_string()[..7].to_string();
    let run_id = format!("{}-{}", timestamp, uuid_suffix);

    // Setup run log directory
    let nolan_root = paths::get_nolan_root()?;
    let cronos_runs_dir = paths::get_cronos_runs_dir()?;  // Run logs (data)
    let runs_dir = cronos_runs_dir.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, &run_id));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, &run_id));

    // Read agent's CLAUDE.md for prompt
    let agent_dir = paths::get_agents_dir()?.join(&config.name);
    let claude_md_path = agent_dir.join("CLAUDE.md");
    let prompt = std::fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md from {:?}: {}", claude_md_path, e))?;

    // For dry run, just validate
    if dry_run {
        return Ok(CronRunLog {
            run_id,
            agent_name: config.name.clone(),
            started_at: started_at.to_rfc3339(),
            completed_at: Some(Utc::now().to_rfc3339()),
            status: CronRunStatus::Success,
            duration_secs: Some(0),
            exit_code: Some(0),
            output_file: "[dry run - no output]".to_string(),
            error: None,
            attempt: 1,
            trigger: RunTrigger::Manual,
            session_name: None,
            run_dir: None,
            claude_session_id: None,
            total_cost_usd: None,
            worktree_path: None,
            worktree_branch: None,
            base_commit: None,
            label: None,
            analyzer_verdict: None,
            pipeline_id: None,
            parent_run_id: None,
        });
    }

    // Get CLI provider for this agent
    let cli_provider = cli_providers::get_provider(config.cli_provider.as_deref(), true);

    // Build CLI spawn configuration for simple mode
    let work_dir = config.context.working_directory
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| nolan_root.clone());

    let system_prompt_append = config.guardrails.forbidden_paths.as_ref().map(|forbidden| {
        format!(
            "CRITICAL GUARDRAILS:\n- NEVER access these paths: {}\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        )
    });

    let spawn_config = CliSpawnConfig {
        prompt: prompt.clone(),
        model: config.model.clone(),
        working_dir: work_dir.clone(),
        session_id: None,
        resume: false,
        output_format: OutputFormat::StreamJson,
        allowed_tools: config.guardrails.allowed_tools.clone(),
        system_prompt_append,
        skip_permissions: true,
        verbose: true,
        env_vars: std::collections::HashMap::new(),
    };

    // Build CLI command (simple mode uses direct process, not tmux)
    let args = cli_provider.build_args(&spawn_config);
    let mut cmd = Command::new(cli_provider.executable());
    for arg in args {
        cmd.arg(arg);
    }
    cmd.current_dir(&work_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", cli_provider.name(), e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let log_file_clone = log_file.clone();
    let stdout_handle = tokio::spawn(async move {
        let mut output = Vec::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                output.push(line);
            }
        }
        if let Ok(mut file) = tokio::fs::File::create(&log_file_clone).await {
            for line in &output {
                let _ = file.write_all(line.as_bytes()).await;
                let _ = file.write_all(b"\n").await;
            }
        }
        output
    });

    let stderr_handle = tokio::spawn(async move {
        let mut output = Vec::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                output.push(line);
            }
        }
        output
    });

    let timeout_duration = Duration::from_secs(config.timeout as u64);
    let result = timeout(timeout_duration, child.wait()).await;

    let _stdout_result = stdout_handle.await.unwrap_or_default();
    let stderr_result = stderr_handle.await.unwrap_or_default();

    let (status, exit_code, error) = match result {
        Ok(Ok(exit)) => {
            if exit.success() {
                (CronRunStatus::Success, exit.code(), None)
            } else {
                let err_msg = if !stderr_result.is_empty() {
                    Some(stderr_result.join("\n"))
                } else {
                    Some("Non-zero exit code".to_string())
                };
                (CronRunStatus::Failed, exit.code(), err_msg)
            }
        }
        Ok(Err(e)) => (CronRunStatus::Failed, None, Some(e.to_string())),
        Err(_) => {
            let _ = child.kill().await;
            (CronRunStatus::Timeout, None, Some(format!("Timeout after {}s", config.timeout)))
        }
    };

    let completed_at = Utc::now();
    let duration = (completed_at - started_at).num_seconds() as u32;

    // Extract cost from output log using the CLI provider's parser
    let cli_result = cli_provider.parse_output(&log_file.to_string_lossy());
    let total_cost_usd = cli_result.total_cost_usd.or_else(|| extract_cost_from_log(&log_file));

    let run_log = CronRunLog {
        run_id,
        agent_name: config.name.clone(),
        started_at: started_at.to_rfc3339(),
        completed_at: Some(completed_at.to_rfc3339()),
        status,
        duration_secs: Some(duration),
        exit_code,
        output_file: log_file.to_string_lossy().to_string(),
        error,
        attempt: 1,
        trigger: RunTrigger::Manual,
        session_name: None,  // Simple mode doesn't use tmux
        run_dir: None,
        claude_session_id: None,  // Simple mode doesn't track session
        total_cost_usd,
        worktree_path: None,  // Simple mode doesn't use worktrees
        worktree_branch: None,
        base_commit: None,
        label: None,  // Simple mode doesn't support labels
        analyzer_verdict: None,
        pipeline_id: None,
        parent_run_id: None,  // Simple mode doesn't track parent
    };

    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    Ok(run_log)
}

/// Check if a post-run analyzer should be triggered and return the trigger info
/// Returns None if no analyzer is configured or status doesn't match trigger conditions
pub fn get_analyzer_trigger_info(
    config: &CronAgentConfig,
    run_log: &CronRunLog,
) -> Option<AnalyzerTriggerInfo> {
    let analyzer_config = config.post_run_analyzer.as_ref()?;

    let should_trigger = match run_log.status {
        CronRunStatus::Success => analyzer_config.on_success,
        CronRunStatus::Failed => analyzer_config.on_failure,
        CronRunStatus::Timeout => analyzer_config.on_timeout,
        _ => false,
    };

    if !should_trigger {
        return None;
    }

    // Build environment variables for the analyzer
    let mut env_vars = ExtraEnvVars::new();
    env_vars.insert("ANALYZED_RUN_ID".to_string(), run_log.run_id.clone());
    env_vars.insert("ANALYZED_AGENT".to_string(), run_log.agent_name.clone());
    env_vars.insert("ANALYZED_OUTPUT_FILE".to_string(), run_log.output_file.clone());
    env_vars.insert("ANALYZED_STATUS".to_string(), format!("{:?}", run_log.status).to_lowercase());
    if let Some(ref session_id) = run_log.claude_session_id {
        env_vars.insert("ANALYZED_SESSION_ID".to_string(), session_id.clone());
    }
    // Pass worktree info from parent run so analyzer run can trigger QA
    if let Some(ref wt_path) = run_log.worktree_path {
        env_vars.insert("ANALYZED_WORKTREE_PATH".to_string(), wt_path.clone());
    }
    if let Some(ref wt_branch) = run_log.worktree_branch {
        env_vars.insert("ANALYZED_WORKTREE_BRANCH".to_string(), wt_branch.clone());
    }
    if let Some(ref base_commit) = run_log.base_commit {
        env_vars.insert("ANALYZED_BASE_COMMIT".to_string(), base_commit.clone());
    }

    Some(AnalyzerTriggerInfo {
        analyzer_agent: analyzer_config.analyzer_agent.clone(),
        env_vars,
    })
}

/// Information needed to trigger a post-run analyzer
#[derive(Clone, Debug)]
pub struct AnalyzerTriggerInfo {
    pub analyzer_agent: String,
    pub env_vars: ExtraEnvVars,
}
