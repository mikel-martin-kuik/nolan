use std::str::FromStr;
use cron::Schedule;
use super::types::*;
use super::executor;

/// Global cronos manager instance
static CRONOS: once_cell::sync::Lazy<tokio::sync::RwLock<Option<super::CronosManager>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::RwLock::new(None));

/// Initialize cronos manager (called at app startup)
pub async fn init_cronos() -> Result<(), String> {
    let manager = super::CronosManager::new().await?;
    manager.start().await?;
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

// Agent CRUD

#[tauri::command]
pub async fn list_cron_agents() -> Result<Vec<CronAgentInfo>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let configs = manager.load_agents().await?;
    let mut infos = Vec::new();

    for config in configs {
        let last_run = manager.get_run_history(Some(&config.name), 1).await?
            .into_iter().next();

        infos.push(CronAgentInfo {
            name: config.name.clone(),
            description: config.description.clone(),
            model: config.model.clone(),
            enabled: config.enabled,
            schedule: describe_cron(&config.schedule.cron),
            next_run: calculate_next_run(&config.schedule.cron),
            last_run,
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

    // Validate cron expression (6-field format with seconds)
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
    let result = executor::execute_cron_agent(&config, true).await;
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

// Manual trigger

#[tauri::command]
pub async fn trigger_cron_agent(name: String) -> Result<String, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&name).await?;
    drop(guard); // Release lock before spawning

    // Execute in background
    let agent_name = name.clone();
    tokio::spawn(async move {
        if let Err(e) = executor::execute_cron_agent(&config, false).await {
            eprintln!("Cron agent {} failed: {}", agent_name, e);
        }
    });

    Ok(format!("Triggered {}", name))
}

// Run history

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
    // Find the log file by run_id
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
                                // Read the output log file
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

// Agent instructions

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

// Helper functions

/// Validate cron expression
/// Note: The cron crate uses 6-field expressions (with seconds).
/// Standard 5-field expressions should have "0 " prepended.
fn validate_cron(expression: &str) -> Result<(), String> {
    // If 5-field expression, prepend seconds
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
    // Simple human-readable descriptions for common patterns
    match expression {
        "0 * * * *" | "0 0 * * * *" => "Every hour".to_string(),
        "0 0 * * *" | "0 0 0 * * *" => "Daily at midnight".to_string(),
        "0 9 * * *" | "0 0 9 * * *" => "Daily at 9am".to_string(),
        "0 9 * * 1" | "0 0 9 * * 1" => "Mondays at 9am".to_string(),
        "0 9 * * 1-5" | "0 0 9 * * 1-5" => "Weekdays at 9am".to_string(),
        _ => expression.to_string(),
    }
}

fn calculate_next_run(expression: &str) -> Option<String> {
    // If 5-field expression, prepend seconds
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.to_string()
    };

    Schedule::from_str(&expr).ok()
        .and_then(|schedule| schedule.upcoming(chrono::Utc).next())
        .map(|dt| dt.to_rfc3339())
}
