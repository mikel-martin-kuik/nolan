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
use crate::utils::paths;
use crate::tmux::session;

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
    execute_cron_agent_with_env(config, manager, trigger, dry_run, output_sender, cancellation, None).await
}

/// Execute a cron agent with extra environment variables
pub async fn execute_cron_agent_with_env(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
    extra_env: Option<ExtraEnvVars>,
) -> Result<CronRunLog, String> {
    // Check concurrency
    if !config.concurrency.allow_parallel && manager.is_running(&config.name).await {
        let run_id = Uuid::new_v4().to_string()[..8].to_string();
        let now = Utc::now();

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
            total_cost_usd: None,
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
) -> Result<CronRunLog, String> {
    let run_id = Uuid::new_v4().to_string()[..8].to_string();
    let started_at = Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();

    // Setup paths
    let nolan_root = paths::get_nolan_root()?;
    let nolan_data_root = paths::get_nolan_data_root()?;
    let cronos_root = nolan_root.join("cronos");  // Agent definitions (source)
    let cronos_runs_dir = paths::get_cronos_runs_dir()?;
    let runs_dir = cronos_runs_dir.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, timestamp));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, timestamp));

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
    let agent_dir = cronos_root.join("agents").join(&config.name);
    let claude_md_path = agent_dir.join("CLAUDE.md");
    let prompt = std::fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))?;

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
            total_cost_usd: None,
        });
    }

    // Build CLI arguments
    let mut claude_args = vec![
        "-p".to_string(),
        prompt.clone(),
        "--dangerously-skip-permissions".to_string(),
        "--verbose".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--model".to_string(),
        config.model.clone(),
    ];

    // Add allowed tools
    if !config.guardrails.allowed_tools.is_empty() {
        claude_args.push("--allowedTools".to_string());
        claude_args.push(config.guardrails.allowed_tools.join(","));
    }

    // Add guardrails via system prompt
    if let Some(ref forbidden) = config.guardrails.forbidden_paths {
        let guardrail_prompt = format!(
            "CRITICAL GUARDRAILS:\n- NEVER access these paths: {}\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        );
        claude_args.push("--append-system-prompt".to_string());
        claude_args.push(guardrail_prompt);
    }

    // Escape prompt for shell (handle quotes and special chars)
    let prompt_escaped = prompt.replace("'", "'\\''");

    // Build shell command that:
    // 1. Sets environment variables
    // 2. Runs claude with output redirected to log file
    // 3. Captures exit code
    // 4. Keeps shell alive briefly for debugging (exec bash at end)
    let work_dir = config.context.working_directory
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| nolan_root.clone());

    // Build environment variable exports
    let mut env_exports = format!("export CRON_RUN_ID='{}' CRON_AGENT='{}' NOLAN_ROOT='{}' NOLAN_DATA_ROOT='{}'",
        run_id, config.name, nolan_root.to_string_lossy(), nolan_data_root.to_string_lossy());

    // Add extra environment variables (e.g., IDEA_ID for parameterized runs)
    if let Some(ref extra) = extra_env {
        for (key, value) in extra {
            env_exports.push_str(&format!(" {}='{}'", key, value.replace("'", "'\\''")));
        }
    }

    let mut cmd_parts = vec![env_exports];

    // Change to working directory
    cmd_parts.push(format!("cd '{}'", work_dir.to_string_lossy()));

    // Build claude command with all args
    let mut claude_cmd = format!("claude -p '{}' --dangerously-skip-permissions --verbose --output-format stream-json --model {}",
        prompt_escaped, config.model);

    if !config.guardrails.allowed_tools.is_empty() {
        claude_cmd.push_str(&format!(" --allowedTools '{}'", config.guardrails.allowed_tools.join(",")));
    }

    if let Some(ref forbidden) = config.guardrails.forbidden_paths {
        let guardrail_prompt = format!(
            "CRITICAL GUARDRAILS:\\n- NEVER access these paths: {}\\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        );
        claude_cmd.push_str(&format!(" --append-system-prompt '{}'", guardrail_prompt.replace("'", "'\\''")));
    }

    // Run claude with output to both terminal (for live streaming) and file
    // Use tee so tmux pipe-pane can capture the live output
    cmd_parts.push(format!("{} 2>&1 | tee '{}'", claude_cmd, log_file.to_string_lossy()));

    // Capture claude's exit code using PIPESTATUS (requires bash)
    // PIPESTATUS[0] is the exit code of the command before the pipe
    let exit_code_file = run_dir.join("exit_code");
    cmd_parts.push(format!("echo ${{PIPESTATUS[0]}} > '{}'", exit_code_file.to_string_lossy()));

    let shell_cmd = cmd_parts.join("; ");

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
        total_cost_usd: None,
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
    manager.register_running_with_session(
        &run_id,
        &config.name,
        None,  // PID not directly available from tmux
        log_file.clone(),
        json_file.clone(),
        Some(session_name.clone()),
        Some(run_dir.clone()),
        Some(cancel_token.clone()),
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

    // Extract cost from output log
    let total_cost_usd = extract_cost_from_log(&log_file);

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
        total_cost_usd,
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
    let run_id = Uuid::new_v4().to_string()[..8].to_string();
    let started_at = Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();

    // Setup run log directory
    let nolan_root = paths::get_nolan_root()?;
    let cronos_root = nolan_root.join("cronos");  // Agent definitions (source)
    let cronos_runs_dir = paths::get_cronos_runs_dir()?;  // Run logs (data)
    let runs_dir = cronos_runs_dir.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, timestamp));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, timestamp));

    // Read agent's CLAUDE.md for prompt (from source, not data)
    let agent_dir = cronos_root.join("agents").join(&config.name);
    let claude_md_path = agent_dir.join("CLAUDE.md");
    let prompt = std::fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))?;

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
            total_cost_usd: None,
        });
    }

    // Build CLI command (simple mode uses direct process, not tmux)
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(&prompt);
    cmd.arg("--dangerously-skip-permissions");
    cmd.arg("--verbose");
    cmd.arg("--output-format").arg("stream-json");

    if !config.guardrails.allowed_tools.is_empty() {
        cmd.arg("--allowedTools")
           .arg(config.guardrails.allowed_tools.join(","));
    }

    if let Some(ref forbidden) = config.guardrails.forbidden_paths {
        let guardrail_prompt = format!(
            "CRITICAL GUARDRAILS:\n- NEVER access these paths: {}\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        );
        cmd.arg("--append-system-prompt").arg(&guardrail_prompt);
    }

    let work_dir = config.context.working_directory
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| nolan_root.clone());
    cmd.current_dir(&work_dir);
    cmd.arg("--model").arg(&config.model);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

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

    // Extract cost from output log
    let total_cost_usd = extract_cost_from_log(&log_file);

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
        total_cost_usd,
    };

    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    Ok(run_log)
}
