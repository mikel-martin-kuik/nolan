use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, RwLock};
use tokio::time::{timeout, Duration};
use chrono::Utc;
use uuid::Uuid;

use super::types::*;
use super::manager::CronosManager;
use crate::utils::paths;

/// Cancellation token for running processes
pub type CancellationToken = Arc<RwLock<bool>>;

/// Output event sender for real-time streaming
pub type OutputSender = broadcast::Sender<CronOutputEvent>;

/// Execute a cron agent with full feature support
///
/// Features:
/// - Real-time output streaming via broadcast channel
/// - Concurrency control (skip or queue if already running)
/// - Retry logic with exponential backoff
/// - Cancellation support
/// - Persistent state tracking
pub async fn execute_cron_agent(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
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

/// Execute a single run attempt
async fn execute_single_run(
    config: &CronAgentConfig,
    manager: &CronosManager,
    trigger: RunTrigger,
    attempt: u32,
    dry_run: bool,
    output_sender: Option<OutputSender>,
    cancellation: Option<CancellationToken>,
) -> Result<CronRunLog, String> {
    let run_id = Uuid::new_v4().to_string()[..8].to_string();
    let started_at = Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();

    // Setup run log directory
    let nolan_root = paths::get_nolan_root()?;
    let cronos_root = nolan_root.join("cronos");
    let runs_dir = cronos_root.join("runs").join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, timestamp));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, timestamp));

    // Emit start event
    if let Some(ref sender) = output_sender {
        let _ = sender.send(CronOutputEvent {
            run_id: run_id.clone(),
            agent_name: config.name.clone(),
            event_type: OutputEventType::Status,
            content: format!("Starting {} (attempt {})", config.name, attempt),
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
        });
    }

    // Build CLI command
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(&prompt);
    cmd.arg("--dangerously-skip-permissions");
    cmd.arg("--verbose");
    cmd.arg("--output-format").arg("stream-json");

    // Add allowed tools
    if !config.guardrails.allowed_tools.is_empty() {
        cmd.arg("--allowedTools")
           .arg(config.guardrails.allowed_tools.join(","));
    }

    // Add guardrails via system prompt
    if let Some(ref forbidden) = config.guardrails.forbidden_paths {
        let guardrail_prompt = format!(
            "CRITICAL GUARDRAILS:\n- NEVER access these paths: {}\n- Maximum file edits: {}",
            forbidden.join(", "),
            config.guardrails.max_file_edits.unwrap_or(10)
        );
        cmd.arg("--append-system-prompt").arg(&guardrail_prompt);
    }

    // Set working directory
    let work_dir = config.context.working_directory
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| nolan_root.clone());
    cmd.current_dir(&work_dir);

    // Set model
    cmd.arg("--model").arg(&config.model);

    // Setup output capture
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn process
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    let pid = child.id();

    // Register as running
    manager.register_running(
        &run_id,
        &config.name,
        pid,
        log_file.clone(),
        json_file.clone(),
    ).await;

    // Take stdout and stderr handles
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Stream output in real-time
    let log_file_clone = log_file.clone();
    let run_id_clone = run_id.clone();
    let agent_name_clone = config.name.clone();
    let output_sender_clone = output_sender.clone();

    let stdout_handle = tokio::spawn(async move {
        let mut output = Vec::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                // Emit real-time event
                if let Some(ref sender) = output_sender_clone {
                    let _ = sender.send(CronOutputEvent {
                        run_id: run_id_clone.clone(),
                        agent_name: agent_name_clone.clone(),
                        event_type: OutputEventType::Stdout,
                        content: line.clone(),
                        timestamp: Utc::now().to_rfc3339(),
                    });
                }
                output.push(line);
            }
        }
        // Write all output to log file
        if let Ok(mut file) = tokio::fs::File::create(&log_file_clone).await {
            for line in &output {
                let _ = file.write_all(line.as_bytes()).await;
                let _ = file.write_all(b"\n").await;
            }
        }
        output
    });

    let run_id_clone2 = run_id.clone();
    let agent_name_clone2 = config.name.clone();
    let output_sender_clone2 = output_sender.clone();

    let stderr_handle = tokio::spawn(async move {
        let mut output = Vec::new();
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                // Emit real-time event
                if let Some(ref sender) = output_sender_clone2 {
                    let _ = sender.send(CronOutputEvent {
                        run_id: run_id_clone2.clone(),
                        agent_name: agent_name_clone2.clone(),
                        event_type: OutputEventType::Stderr,
                        content: line.clone(),
                        timestamp: Utc::now().to_rfc3339(),
                    });
                }
                output.push(line);
            }
        }
        output
    });

    // Wait with timeout and cancellation check
    let timeout_duration = Duration::from_secs(config.timeout as u64);
    let result = wait_with_cancellation(&mut child, timeout_duration, cancellation).await;

    // Wait for output capture to complete
    let _stdout_result = stdout_handle.await.unwrap_or_default();
    let stderr_result = stderr_handle.await.unwrap_or_default();

    // Unregister from running
    manager.unregister_running(&config.name).await;

    let (status, exit_code, error) = match result {
        WaitResult::Completed(Ok(exit)) => {
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
        WaitResult::Completed(Err(e)) => {
            (CronRunStatus::Failed, None, Some(e.to_string()))
        }
        WaitResult::Timeout => {
            let _ = child.kill().await;
            (CronRunStatus::Timeout, None, Some(format!("Timeout after {}s", config.timeout)))
        }
        WaitResult::Cancelled => {
            let _ = child.kill().await;
            (CronRunStatus::Cancelled, None, Some("Cancelled by user".to_string()))
        }
    };

    let completed_at = Utc::now();
    let duration = (completed_at - started_at).num_seconds() as u32;

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
    };

    // Write JSON log
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

    Ok(run_log)
}

enum WaitResult {
    Completed(Result<std::process::ExitStatus, std::io::Error>),
    Timeout,
    Cancelled,
}

async fn wait_with_cancellation(
    child: &mut Child,
    timeout_duration: Duration,
    cancellation: Option<CancellationToken>,
) -> WaitResult {
    let check_interval = Duration::from_millis(100);
    let start = std::time::Instant::now();

    loop {
        // Check cancellation
        if let Some(ref token) = cancellation {
            if *token.read().await {
                return WaitResult::Cancelled;
            }
        }

        // Check timeout
        if start.elapsed() > timeout_duration {
            return WaitResult::Timeout;
        }

        // Try to get exit status (non-blocking)
        match child.try_wait() {
            Ok(Some(status)) => return WaitResult::Completed(Ok(status)),
            Ok(None) => {
                // Still running, wait a bit
                tokio::time::sleep(check_interval).await;
            }
            Err(e) => return WaitResult::Completed(Err(e)),
        }
    }
}

/// Cancel a running agent
pub async fn cancel_cron_agent(manager: &CronosManager, agent_name: &str) -> Result<(), String> {
    let process = manager.get_running_process(agent_name).await
        .ok_or_else(|| format!("Agent '{}' is not running", agent_name))?;

    if let Some(pid) = process.pid {
        // Kill the process
        #[cfg(unix)]
        {
            use std::process::Command as StdCommand;
            let _ = StdCommand::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .output();
        }

        #[cfg(windows)]
        {
            use std::process::Command as StdCommand;
            let _ = StdCommand::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output();
        }
    }

    // Update run log to show cancelled
    let now = Utc::now();
    let run_log = CronRunLog {
        run_id: process.run_id.clone(),
        agent_name: agent_name.to_string(),
        started_at: process.started_at.to_rfc3339(),
        completed_at: Some(now.to_rfc3339()),
        status: CronRunStatus::Cancelled,
        duration_secs: Some((now - process.started_at).num_seconds() as u32),
        exit_code: None,
        output_file: process.log_file.to_string_lossy().to_string(),
        error: Some("Cancelled by user".to_string()),
        attempt: 1,
        trigger: RunTrigger::Manual,
    };

    // Write updated JSON
    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&process.json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    // Unregister
    manager.unregister_running(agent_name).await;

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
    let cronos_root = nolan_root.join("cronos");
    let runs_dir = cronos_root.join("runs").join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}.log", config.name, timestamp));
    let json_file = runs_dir.join(format!("{}-{}.json", config.name, timestamp));

    // Read agent's CLAUDE.md for prompt
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
        });
    }

    // Build CLI command
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
    };

    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    Ok(run_log)
}
