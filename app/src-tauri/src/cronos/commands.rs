use std::str::FromStr;
use tokio::sync::broadcast;
use cron::Schedule;
use tauri::{AppHandle, Emitter};

use super::types::*;
use super::executor;

/// Global cronos manager instance
static CRONOS: once_cell::sync::Lazy<tokio::sync::RwLock<Option<super::CronosManager>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::RwLock::new(None));

/// Global output broadcast channel for real-time streaming
static OUTPUT_SENDER: once_cell::sync::Lazy<broadcast::Sender<CronOutputEvent>> =
    once_cell::sync::Lazy::new(|| {
        let (tx, _) = broadcast::channel(1000);
        tx
    });

/// Initialize cronos manager (called at app startup)
pub async fn init_cronos() -> Result<(), String> {
    let manager = super::CronosManager::new().await?;
    manager.start().await?;

    // Check for missed runs on startup
    let missed = manager.check_missed_runs().await?;
    for (agent_name, policy) in missed {
        if policy == CatchUpPolicy::RunOnce || policy == CatchUpPolicy::RunAll {
            println!("[Cronos] Catching up missed run for: {}", agent_name);
            // Queue catch-up run (would be implemented with actual scheduling)
        }
    }

    *CRONOS.write().await = Some(manager);
    Ok(())
}

/// Shutdown cronos manager (called at app close)
pub async fn shutdown_cronos() -> Result<(), String> {
    let mut guard = CRONOS.write().await;
    if let Some(manager) = guard.as_mut() {
        manager.shutdown().await?;
    }
    Ok(())
}

// ========================
// Agent CRUD
// ========================

#[tauri::command]
pub async fn list_cron_agents() -> Result<Vec<CronAgentInfo>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let configs = manager.load_agents().await?;
    let mut infos = Vec::new();

    for config in configs {
        let last_run = manager.get_run_history(Some(&config.name), 1).await?
            .into_iter().next();

        let is_running = manager.is_running(&config.name).await;
        let current_run_id = if is_running {
            manager.get_running_process(&config.name).await.map(|p| p.run_id)
        } else {
            None
        };

        let health = manager.calculate_agent_health(&config.name).await;
        let stats = manager.calculate_agent_stats(&config.name, 50).await;
        let agent_state = manager.get_agent_state(&config.name).await;

        infos.push(CronAgentInfo {
            name: config.name.clone(),
            description: config.description.clone(),
            model: config.model.clone(),
            enabled: config.enabled,
            schedule: describe_cron(&config.schedule.cron),
            cron_expression: config.schedule.cron.clone(),
            next_run: calculate_next_run(&config.schedule.cron),
            last_run,
            is_running,
            current_run_id,
            consecutive_failures: agent_state.map(|s| s.consecutive_failures).unwrap_or(0),
            health,
            stats,
        });
    }

    Ok(infos)
}

#[tauri::command]
pub async fn get_cron_agent(name: String) -> Result<CronAgentConfig, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_agent(&name).await
}

#[tauri::command]
pub async fn create_cron_agent(config: CronAgentConfig) -> Result<(), String> {
    // Validate name format: cron-{task}
    if !config.name.starts_with("cron-") {
        return Err("Agent name must start with 'cron-'".to_string());
    }
    if !config.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Agent name must contain only lowercase letters, digits, and hyphens".to_string());
    }

    // Validate cron expression
    validate_cron(&config.schedule.cron)?;

    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.save_agent(&config).await?;

    // Create default CLAUDE.md
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let claude_md = nolan_root
        .join("cronos/agents")
        .join(&config.name)
        .join("CLAUDE.md");

    if !claude_md.exists() {
        let template = format!(
            "# {}\n\n{}\n\n## Instructions\n\nDefine your task instructions here.\n",
            config.name, config.description
        );
        std::fs::write(&claude_md, template)
            .map_err(|e| format!("Failed to create CLAUDE.md: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_cron_agent(name: String, config: CronAgentConfig) -> Result<(), String> {
    if config.name != name {
        return Err("Cannot change agent name".to_string());
    }
    validate_cron(&config.schedule.cron)?;

    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.save_agent(&config).await
}

#[tauri::command]
pub async fn delete_cron_agent(name: String) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Check if running
    if manager.is_running(&name).await {
        return Err("Cannot delete running agent. Stop it first.".to_string());
    }

    manager.delete_agent(&name).await
}

#[tauri::command]
pub async fn toggle_cron_agent(name: String, enabled: bool) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let mut config = manager.get_agent(&name).await?;
    config.enabled = enabled;
    manager.save_agent(&config).await
}

#[tauri::command]
pub async fn test_cron_agent(name: String) -> Result<TestRunResult, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&name).await?;

    let start = std::time::Instant::now();
    let result = executor::execute_cron_agent_simple(&config, true).await;
    let duration = start.elapsed().as_secs() as u32;

    match result {
        Ok(log) => Ok(TestRunResult {
            success: log.status == CronRunStatus::Success,
            output: format!("Dry run completed. Would execute: {}", config.name),
            duration_secs: duration,
        }),
        Err(e) => Ok(TestRunResult {
            success: false,
            output: e,
            duration_secs: duration,
        }),
    }
}

// ========================
// Execution Control
// ========================

#[tauri::command]
pub async fn trigger_cron_agent(name: String, app: AppHandle) -> Result<String, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&name).await?;

    // Check if already running (unless parallel allowed)
    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    // Get output sender for streaming
    let output_sender = OUTPUT_SENDER.clone();

    // Setup event forwarding to frontend
    let app_clone = app.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app_clone.emit("cronos:output", &event);
        }
    });

    // Execute in background
    let agent_name = name.clone();
    tokio::spawn(async move {
        let guard = CRONOS.read().await;
        if let Some(manager) = guard.as_ref() {
            if let Err(e) = executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender),
                None,
            ).await {
                eprintln!("Cron agent {} failed: {}", agent_name, e);
            }
        }
    });

    Ok(format!("Triggered {}", name))
}

/// Trigger a cron agent via HTTP API (no AppHandle required)
pub async fn trigger_cron_agent_api(name: String) -> Result<String, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&name).await?;

    // Check if already running (unless parallel allowed)
    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    // Get output sender for streaming (but no frontend to emit to)
    let output_sender = OUTPUT_SENDER.clone();

    // Execute in background
    let agent_name = name.clone();
    tokio::spawn(async move {
        let guard = CRONOS.read().await;
        if let Some(manager) = guard.as_ref() {
            if let Err(e) = executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender),
                None,
            ).await {
                eprintln!("Cron agent {} failed: {}", agent_name, e);
            }
        }
    });

    Ok(format!("Triggered {}", name))
}

#[tauri::command]
pub async fn cancel_cron_agent(name: String) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    executor::cancel_cron_agent(manager, &name).await
}

#[tauri::command]
pub async fn get_running_agents() -> Result<Vec<RunningAgentInfo>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let running = manager.list_running().await;
    Ok(running.into_iter().map(|p| RunningAgentInfo {
        run_id: p.run_id,
        agent_name: p.agent_name,
        started_at: p.started_at.to_rfc3339(),
        duration_secs: (chrono::Utc::now() - p.started_at).num_seconds() as u32,
    }).collect())
}

// ========================
// Run History
// ========================

#[tauri::command]
pub async fn get_cron_run_history(
    agent_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<CronRunLog>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_run_history(agent_name.as_deref(), limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn get_cron_run_log(run_id: String) -> Result<String, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let runs_dir = nolan_root.join("cronos/runs");

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                return std::fs::read_to_string(&log.output_file)
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

// ========================
// Agent Instructions
// ========================

#[tauri::command]
pub async fn read_cron_agent_claude_md(name: String) -> Result<String, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let path = nolan_root.join("cronos/agents").join(&name).join("CLAUDE.md");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

#[tauri::command]
pub async fn write_cron_agent_claude_md(name: String, content: String) -> Result<(), String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let path = nolan_root.join("cronos/agents").join(&name).join("CLAUDE.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
}

// ========================
// Health & Monitoring
// ========================

#[tauri::command]
pub async fn get_cronos_health() -> Result<CronosHealthSummary, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

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

    // Calculate success rates
    let runs_7d: Vec<_> = recent_runs.iter()
        .filter(|r| {
            chrono::DateTime::parse_from_rfc3339(&r.started_at)
                .map(|dt| dt > chrono::Utc::now() - chrono::Duration::days(7))
                .unwrap_or(false)
        })
        .collect();

    let success_7d = if runs_7d.is_empty() {
        0.0
    } else {
        runs_7d.iter().filter(|r| r.status == CronRunStatus::Success).count() as f32
            / runs_7d.len() as f32
    };

    Ok(CronosHealthSummary {
        total_agents: configs.len() as u32,
        active_agents: configs.iter().filter(|c| c.enabled).count() as u32,
        running_agents: running.len() as u32,
        healthy_agents: healthy,
        warning_agents: warning,
        critical_agents: critical,
        recent_runs,
        success_rate_7d: success_7d,
        success_rate_30d: success_7d, // Simplified for now
    })
}

#[tauri::command]
pub async fn get_agent_stats(name: String) -> Result<AgentStats, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    Ok(manager.calculate_agent_stats(&name, 100).await)
}

// ========================
// Real-time Output Streaming
// ========================

#[tauri::command]
pub async fn subscribe_cron_output(app: AppHandle) -> Result<(), String> {
    let mut receiver = OUTPUT_SENDER.subscribe();

    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("cronos:output", &event);
        }
    });

    Ok(())
}

// ========================
// Helper Types
// ========================

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunningAgentInfo {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: String,
    pub duration_secs: u32,
}

// ========================
// Helper Functions
// ========================

fn validate_cron(expression: &str) -> Result<(), String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.to_string()
    };

    Schedule::from_str(&expr)
        .map_err(|e| format!("Invalid cron expression '{}': {}", expression, e))?;
    Ok(())
}

fn describe_cron(expression: &str) -> String {
    match expression {
        "0 * * * *" | "0 0 * * * *" => "Every hour".to_string(),
        "0 0 * * *" | "0 0 0 * * *" => "Daily at midnight".to_string(),
        "0 9 * * *" | "0 0 9 * * *" => "Daily at 9am".to_string(),
        "0 9 * * 1" | "0 0 9 * * 1" => "Mondays at 9am".to_string(),
        "0 9 * * 1-5" | "0 0 9 * * 1-5" => "Weekdays at 9am".to_string(),
        "0 */4 * * *" | "0 0 */4 * * *" => "Every 4 hours".to_string(),
        "0 */2 * * *" | "0 0 */2 * * *" => "Every 2 hours".to_string(),
        "*/30 * * * *" | "0 */30 * * * *" => "Every 30 minutes".to_string(),
        "*/15 * * * *" | "0 */15 * * * *" => "Every 15 minutes".to_string(),
        _ => expression.to_string(),
    }
}

fn calculate_next_run(expression: &str) -> Option<String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.to_string()
    };

    Schedule::from_str(&expr).ok()
        .and_then(|schedule| schedule.upcoming(chrono::Utc).next())
        .map(|dt| dt.to_rfc3339())
}

/// Parse cron expression and return next N run times
#[tauri::command]
pub async fn get_cron_next_runs(expression: String, count: usize) -> Result<Vec<String>, String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.clone()
    };

    let schedule = Schedule::from_str(&expr)
        .map_err(|e| format!("Invalid cron expression: {}", e))?;

    Ok(schedule.upcoming(chrono::Utc)
        .take(count.min(10))
        .map(|dt| dt.to_rfc3339())
        .collect())
}

/// Describe cron expression in human-readable format
#[tauri::command]
pub async fn describe_cron_expression(expression: String) -> Result<CronDescription, String> {
    validate_cron(&expression)?;

    let next_runs = get_cron_next_runs(expression.clone(), 5).await?;

    Ok(CronDescription {
        expression: expression.clone(),
        human_readable: describe_cron(&expression),
        next_runs,
    })
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct CronDescription {
    pub expression: String,
    pub human_readable: String,
    pub next_runs: Vec<String>,
}
