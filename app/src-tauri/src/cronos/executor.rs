use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use chrono::Utc;
use uuid::Uuid;

use super::types::*;
use crate::utils::paths;

/// Execute a cron agent in headless mode
///
/// Default behaviors (per plan review):
/// - Persistence: No - schedules in memory, reload from YAML on restart
/// - Missed runs: Skip - no catch-up
/// - Concurrency: Allow parallel execution
/// - Notifications: Console logging only (no system notifications)
/// - Git: No auto-commit
pub async fn execute_cron_agent(
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

    // Build CLI command
    // Note: -p (print) with --output-format=stream-json requires --verbose
    // Cron agents run autonomously, so they need --dangerously-skip-permissions
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

    // For dry run, just validate the command
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
        });
    }

    // Setup output capture
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn process
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    // Take stdout and stderr handles
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Collect output in buffers (FIX: capture output inline before process wait)
    let log_file_clone = log_file.clone();
    let stdout_handle = tokio::spawn(async move {
        let mut output = Vec::new();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                output.push(line);
            }
        }
        // Write all output to log file after fully capturing
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

    // Wait with timeout
    let timeout_duration = Duration::from_secs(config.timeout as u64);
    let result = timeout(timeout_duration, child.wait()).await;

    // Wait for output capture to complete (FIX: ensure output is fully captured)
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
            // Timeout - kill the process
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
    };

    // Write JSON log
    let json = serde_json::to_string_pretty(&run_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    Ok(run_log)
}
