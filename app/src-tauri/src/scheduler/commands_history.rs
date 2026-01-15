//! scheduler/commands_history.rs
//!
//! Run history, session recovery, and session relaunch functionality.
//! Handles viewing past runs and continuing sessions.
//!
//! Entry points:
//! - `get_scheduled_run_history()` - List run history
//! - `get_scheduled_run_log()` - Get log for a specific run
//! - `relaunch_scheduled_session()` - Continue a previous session
//! - Session recovery commands

use tauri::{AppHandle, Emitter};

use super::executor;
use super::types::*;
use super::commands::{SCHEDULER, OUTPUT_SENDER};
use super::commands_analyzer::trigger_post_run_analyzer;

// === RUN HISTORY ===

#[tauri::command(rename_all = "snake_case")]
pub async fn get_scheduled_run_history(
    agent_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ScheduledRunLog>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.get_run_history(agent_name.as_deref(), limit.unwrap_or(50)).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_scheduled_run_log(run_id: String) -> Result<String, String> {
    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        let running = manager.list_running().await;
        for process in running {
            if process.run_id == run_id {
                return Ok(std::fs::read(&process.log_file)
                    .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                    .unwrap_or_else(|_| String::new()));
            }
        }
    }
    drop(guard);

    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path())
                .into_iter()
                .flatten()
                .flatten()
            {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                            if log.run_id == run_id {
                                return std::fs::read(&log.output_file)
                                    .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                                    .map_err(|e| format!("Failed to read log: {}", e));
                            }
                        }
                    }
                }
            }
        }
    }

    Err(format!("Run {} not found", run_id))
}

// === SESSION RECOVERY ===

pub async fn recover_orphaned_scheduled_sessions() -> Result<ScheduledRecoveryResult, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.recover_orphaned_scheduled_sessions().await
}

#[tauri::command]
pub async fn list_orphaned_scheduled_sessions() -> Result<Vec<OrphanedSessionInfo>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let orphaned = manager.find_orphaned_scheduled_sessions()?;
    Ok(orphaned
        .into_iter()
        .map(|s| OrphanedSessionInfo {
            run_id: s.run_log.run_id,
            agent_name: s.run_log.agent_name,
            session_name: s.run_log.session_name,
            started_at: s.run_log.started_at,
            session_alive: s.session_alive,
        })
        .collect())
}

#[tauri::command]
pub async fn recover_scheduled_sessions() -> Result<ScheduledRecoveryResult, String> {
    recover_orphaned_scheduled_sessions().await
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct OrphanedSessionInfo {
    pub run_id: String,
    pub agent_name: String,
    pub session_name: Option<String>,
    pub started_at: String,
    pub session_alive: bool,
}

// === SESSION RELAUNCH ===

#[tauri::command(rename_all = "snake_case")]
pub async fn relaunch_scheduled_session(
    run_id: String,
    follow_up_prompt: String,
    app: AppHandle,
) -> Result<String, String> {
    relaunch_scheduled_session_impl(run_id, follow_up_prompt, Some(app)).await
}

pub async fn relaunch_scheduled_session_api(
    run_id: String,
    follow_up_prompt: String,
) -> Result<String, String> {
    relaunch_scheduled_session_impl(run_id, follow_up_prompt, None).await
}

async fn relaunch_scheduled_session_impl(
    run_id: String,
    follow_up_prompt: String,
    app: Option<AppHandle>,
) -> Result<String, String> {
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut original_run: Option<ScheduledRunLog> = None;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path())
                .into_iter()
                .flatten()
                .flatten()
            {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                            if log.run_id == run_id {
                                original_run = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if original_run.is_some() {
            break;
        }
    }

    let original = original_run.ok_or_else(|| format!("Run {} not found", run_id))?;

    let claude_session_id = original.claude_session_id.ok_or_else(|| {
        "Original run has no claude_session_id (older run before this feature)".to_string()
    })?;

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&original.agent_name).await?;

    if !config.concurrency.allow_parallel && manager.is_running(&original.agent_name).await {
        return Err(format!("Agent '{}' is already running", original.agent_name));
    }
    drop(guard);

    let started_at = chrono::Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();
    let uuid_suffix = uuid::Uuid::new_v4().to_string()[..7].to_string();
    let new_run_id = format!("{}-{}", timestamp, uuid_suffix);

    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}-resume.log", original.agent_name, &new_run_id));
    let json_file = runs_dir.join(format!("{}-{}-resume.json", original.agent_name, &new_run_id));

    let run_dir = runs_dir.join(format!("{}-{}-resume", original.agent_name, new_run_id));
    std::fs::create_dir_all(&run_dir)
        .map_err(|e| format!("Failed to create run directory: {}", e))?;

    #[cfg(unix)]
    {
        let claude_link = run_dir.join(".claude");
        if !claude_link.exists() {
            let _ = std::os::unix::fs::symlink(nolan_root.join(".claude"), &claude_link);
        }
    }

    let session_name = format!("{}-{}-resume", original.agent_name, &new_run_id);
    let prompt_escaped = follow_up_prompt.replace("'", "'\\''");

    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let env_exports = format!(
        "export CRON_RUN_ID='{}' CRON_AGENT='{}' CRON_ORIGINAL_RUN='{}' NOLAN_ROOT='{}' NOLAN_DATA_ROOT='{}'",
        new_run_id, original.agent_name, run_id, nolan_root.to_string_lossy(), nolan_data_root.to_string_lossy()
    );

    let work_dir = if config.worktree.as_ref().map(|wt| wt.enabled).unwrap_or(false) {
        original.worktree_path.as_ref()
            .filter(|d| std::path::Path::new(d).exists())
            .map(std::path::PathBuf::from)
            .or_else(|| config.context.working_directory.as_ref().map(std::path::PathBuf::from))
            .unwrap_or_else(|| nolan_root.clone())
    } else {
        config.context.working_directory.as_ref()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| nolan_root.clone())
    };

    let claude_cmd = format!(
        "claude --resume '{}' -p '{}' --dangerously-skip-permissions --verbose --output-format stream-json --model {}",
        claude_session_id, prompt_escaped, config.model
    );

    let exit_code_file = run_dir.join("exit_code");
    let shell_cmd = format!(
        "{}; cd '{}'; {} 2>&1 | tee '{}'; echo ${{PIPESTATUS[0]}} > '{}'",
        env_exports,
        work_dir.to_string_lossy(),
        claude_cmd,
        log_file.to_string_lossy(),
        exit_code_file.to_string_lossy()
    );

    let initial_log = ScheduledRunLog {
        run_id: new_run_id.clone(),
        agent_name: original.agent_name.clone(),
        started_at: started_at.to_rfc3339(),
        completed_at: None,
        status: ScheduledRunStatus::Running,
        duration_secs: None,
        exit_code: None,
        output_file: log_file.to_string_lossy().to_string(),
        error: None,
        attempt: 1,
        trigger: RunTrigger::Manual,
        session_name: Some(session_name.clone()),
        run_dir: Some(run_dir.to_string_lossy().to_string()),
        claude_session_id: Some(claude_session_id.clone()),
        total_cost_usd: None,
        worktree_path: original.worktree_path.clone(),
        worktree_branch: original.worktree_branch.clone(),
        base_commit: original.base_commit.clone(),
        analyzer_verdict: None,
        pipeline_id: original.pipeline_id.clone(),
        label: original.label.clone(),
        parent_run_id: None,
    };

    let json = serde_json::to_string_pretty(&initial_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, &json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    let output = std::process::Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &session_name,
            "-c", &run_dir.to_string_lossy(),
            "bash", "-c", &shell_cmd,
        ])
        .output()
        .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_dir_all(&run_dir);
        return Err(format!(
            "Failed to start tmux session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    if let Err(e) = crate::commands::lifecycle::register_session(
        &session_name,
        &original.agent_name,
        &run_dir.to_string_lossy(),
        "",
    ) {
        eprintln!("Warning: Failed to register cron session: {}", e);
    }

    let output_sender = OUTPUT_SENDER.clone();
    if let Some(app) = app {
        let mut receiver = output_sender.subscribe();
        tokio::spawn(async move {
            while let Ok(event) = receiver.recv().await {
                let _ = app.emit("scheduler:output", &event);
            }
        });
    }

    let _ = output_sender.send(ScheduledOutputEvent {
        run_id: new_run_id.clone(),
        agent_name: original.agent_name.clone(),
        event_type: OutputEventType::Status,
        content: format!("Relaunching session {} (original run: {})", claude_session_id, run_id),
        timestamp: started_at.to_rfc3339(),
    });

    let agent_name = original.agent_name.clone();
    let config_timeout = config.timeout;
    let config_for_analyzer = config.clone();
    let original_worktree_path = original.worktree_path.clone();
    let original_worktree_branch = original.worktree_branch.clone();
    let original_base_commit = original.base_commit.clone();
    let original_label = original.label.clone();
    let result_run_id = new_run_id.clone();

    tokio::spawn(async move {
        let timeout_duration = std::time::Duration::from_secs(config_timeout as u64);
        let start = std::time::Instant::now();
        let check_interval = std::time::Duration::from_secs(2);

        loop {
            if exit_code_file.exists() {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                break;
            }

            if let Ok(output) = std::process::Command::new("tmux")
                .args(&["has-session", "-t", &session_name])
                .output()
            {
                if !output.status.success() {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    break;
                }
            }

            if start.elapsed() > timeout_duration {
                let _ = std::process::Command::new("tmux")
                    .args(&["kill-session", "-t", &session_name])
                    .output();
                break;
            }

            tokio::time::sleep(check_interval).await;
        }

        let completed_at = chrono::Utc::now();
        let duration = (completed_at - started_at).num_seconds() as u32;

        let exit_code = std::fs::read_to_string(&exit_code_file)
            .ok()
            .and_then(|s| s.trim().parse::<i32>().ok());

        let (status, error) = if start.elapsed() > timeout_duration {
            (ScheduledRunStatus::Timeout, Some(format!("Timeout after {}s", config_timeout)))
        } else if exit_code == Some(0) {
            (ScheduledRunStatus::Success, None)
        } else {
            (ScheduledRunStatus::Failed, Some("Non-zero exit code".to_string()))
        };

        let total_cost_usd = executor::extract_cost_from_log_file(&log_file.to_string_lossy());

        let final_log = ScheduledRunLog {
            run_id: new_run_id.clone(),
            agent_name: agent_name.clone(),
            started_at: started_at.to_rfc3339(),
            completed_at: Some(completed_at.to_rfc3339()),
            status: status.clone(),
            duration_secs: Some(duration),
            exit_code,
            output_file: log_file.to_string_lossy().to_string(),
            error,
            attempt: 1,
            trigger: RunTrigger::Manual,
            session_name: Some(session_name.clone()),
            run_dir: Some(run_dir.to_string_lossy().to_string()),
            claude_session_id: Some(claude_session_id),
            total_cost_usd,
            worktree_path: original_worktree_path,
            worktree_branch: original_worktree_branch,
            base_commit: original_base_commit,
            analyzer_verdict: None,
            pipeline_id: None,
            label: original_label,
            parent_run_id: None,
        };

        if let Ok(json) = serde_json::to_string_pretty(&final_log) {
            let _ = std::fs::write(&json_file, json);
        }

        let _ = output_sender.send(ScheduledOutputEvent {
            run_id: new_run_id,
            agent_name: agent_name.clone(),
            event_type: OutputEventType::Complete,
            content: format!("Relaunch completed with status: {:?}", status),
            timestamp: completed_at.to_rfc3339(),
        });

        if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config_for_analyzer, &final_log) {
            trigger_post_run_analyzer(trigger_info, output_sender, None).await;
        }

        if status == ScheduledRunStatus::Success {
            let _ = std::fs::remove_dir_all(&run_dir);
        }
    });

    Ok(format!("Relaunched session for run {} as new run {}", run_id, result_run_id))
}

// === HEALTH & MONITORING ===

#[tauri::command]
pub async fn get_scheduler_health() -> Result<SchedulerHealthSummary, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let configs = manager.load_agents().await?;
    let running = manager.list_running().await;
    let recent_runs = manager.get_run_history(None, 20).await?;

    let mut healthy = 0;
    let mut warning = 0;
    let mut critical = 0;

    for config in &configs {
        let health = manager.calculate_agent_health(&config.name).await;
        match health.status {
            HealthStatus::Healthy => healthy += 1,
            HealthStatus::Warning => warning += 1,
            HealthStatus::Critical => critical += 1,
            HealthStatus::Unknown => {}
        }
    }

    let runs_7d: Vec<_> = recent_runs
        .iter()
        .filter(|r| {
            chrono::DateTime::parse_from_rfc3339(&r.started_at)
                .map(|dt| dt > chrono::Utc::now() - chrono::Duration::days(7))
                .unwrap_or(false)
        })
        .collect();

    let success_7d = if runs_7d.is_empty() {
        0.0
    } else {
        runs_7d.iter().filter(|r| r.status == ScheduledRunStatus::Success).count() as f32
            / runs_7d.len() as f32
    };

    let total_cost_7d: f32 = runs_7d
        .iter()
        .filter_map(|r| {
            if let Some(cost) = r.total_cost_usd {
                return Some(cost);
            }
            if !r.output_file.is_empty() {
                return executor::extract_cost_from_log_file(&r.output_file);
            }
            None
        })
        .sum();

    Ok(SchedulerHealthSummary {
        total_agents: configs.len() as u32,
        active_agents: configs.iter().filter(|c| c.enabled).count() as u32,
        running_agents: running.len() as u32,
        healthy_agents: healthy,
        warning_agents: warning,
        critical_agents: critical,
        recent_runs,
        success_rate_7d: success_7d,
        success_rate_30d: success_7d,
        total_cost_7d,
    })
}

#[tauri::command]
pub async fn get_agent_stats(name: String) -> Result<AgentStats, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    Ok(manager.calculate_agent_stats(&name, 100).await)
}

#[tauri::command]
pub async fn subscribe_scheduled_output(app: AppHandle) -> Result<(), String> {
    let mut receiver = OUTPUT_SENDER.subscribe();

    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("scheduler:output", &event);
        }
    });

    Ok(())
}
