//! scheduler/commands_schedules.rs
//!
//! Schedule CRUD operations for managing cron-based schedules.
//! Handles creating, updating, and deleting schedule configurations.
//!
//! Entry points:
//! - `list_schedules()` - List all schedules
//! - `create_schedule()` - Create a new schedule
//! - `update_schedule()` - Update existing schedule
//! - `delete_schedule()` - Remove a schedule
//! - `toggle_schedule()` - Enable/disable a schedule

use cron::Schedule;
use std::str::FromStr;

use super::types::*;
use super::commands::SCHEDULER;

// === HELPER FUNCTIONS ===

pub fn validate_cron(expression: &str) -> Result<(), String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.to_string()
    };

    Schedule::from_str(&expr)
        .map_err(|e| format!("Invalid cron expression '{}': {}", expression, e))?;
    Ok(())
}

pub fn describe_cron(expression: &str) -> String {
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

pub fn calculate_next_run(expression: &str) -> Option<String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.to_string()
    };

    Schedule::from_str(&expr)
        .ok()
        .and_then(|schedule| schedule.upcoming(chrono::Utc).next())
        .map(|dt| dt.to_rfc3339())
}

fn get_schedules_path() -> Result<std::path::PathBuf, String> {
    crate::utils::paths::get_schedules_path()
}

fn load_schedules_from_disk() -> Result<Vec<ScheduleConfig>, String> {
    let path = get_schedules_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read schedules: {}", e))?;
    let file: SchedulesFile = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse schedules: {}", e))?;
    Ok(file.schedules)
}

fn save_schedules_to_disk(schedules: &[ScheduleConfig]) -> Result<(), String> {
    let path = get_schedules_path()?;
    let file = SchedulesFile {
        schedules: schedules.to_vec(),
    };
    let content = serde_yaml::to_string(&file)
        .map_err(|e| format!("Failed to serialize schedules: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write schedules: {}", e))?;
    Ok(())
}

// === TAURI COMMANDS ===

/// Parse cron expression and return next N run times
#[tauri::command]
pub async fn get_schedule_next_runs(expression: String, count: usize) -> Result<Vec<String>, String> {
    let expr = if expression.split_whitespace().count() == 5 {
        format!("0 {}", expression)
    } else {
        expression.clone()
    };

    let schedule = Schedule::from_str(&expr)
        .map_err(|e| format!("Invalid cron expression: {}", e))?;

    Ok(schedule
        .upcoming(chrono::Utc)
        .take(count.min(10))
        .map(|dt| dt.to_rfc3339())
        .collect())
}

/// Describe cron expression in human-readable format
#[tauri::command]
pub async fn describe_schedule_expression(expression: String) -> Result<CronDescription, String> {
    validate_cron(&expression)?;
    let next_runs = get_schedule_next_runs(expression.clone(), 5).await?;

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

/// List all schedules
#[tauri::command]
pub async fn list_schedules() -> Result<Vec<ScheduleConfig>, String> {
    let mut schedules = load_schedules_from_disk()?;

    for schedule in &mut schedules {
        if schedule.enabled {
            schedule.next_run = calculate_next_run(&schedule.cron);
        }
    }

    Ok(schedules)
}

/// Create a new schedule
#[tauri::command(rename_all = "snake_case")]
pub async fn create_schedule(
    name: String,
    agent_name: String,
    cron: String,
    enabled: bool,
    timezone: Option<String>,
) -> Result<ScheduleConfig, String> {
    validate_cron(&cron)?;

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let _ = manager.get_agent(&agent_name).await?;
    drop(guard);

    let schedule = ScheduleConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        agent_name,
        cron,
        enabled,
        timezone,
        next_run: None,
    };

    let mut schedules = load_schedules_from_disk()?;
    schedules.push(schedule.clone());
    save_schedules_to_disk(&schedules)?;

    if enabled {
        let guard = SCHEDULER.read().await;
        if let Some(manager) = guard.as_ref() {
            manager.schedule_from_config(&schedule).await?;
        }
    }

    Ok(schedule)
}

/// Update an existing schedule
#[tauri::command(rename_all = "snake_case")]
pub async fn update_schedule(
    id: String,
    name: String,
    agent_name: String,
    cron: String,
    enabled: bool,
    timezone: Option<String>,
) -> Result<ScheduleConfig, String> {
    validate_cron(&cron)?;

    let mut schedules = load_schedules_from_disk()?;
    let idx = schedules.iter().position(|s| s.id == id)
        .ok_or_else(|| format!("Schedule '{}' not found", id))?;

    let old_schedule = schedules[idx].clone();

    schedules[idx] = ScheduleConfig {
        id: id.clone(),
        name,
        agent_name,
        cron,
        enabled,
        timezone,
        next_run: None,
    };

    save_schedules_to_disk(&schedules)?;

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        manager.unschedule(&old_schedule.id).await?;
        if enabled {
            manager.schedule_from_config(&schedules[idx]).await?;
        }
    }

    Ok(schedules[idx].clone())
}

/// Delete a schedule
#[tauri::command]
pub async fn delete_schedule(id: String) -> Result<(), String> {
    let mut schedules = load_schedules_from_disk()?;
    let idx = schedules.iter().position(|s| s.id == id)
        .ok_or_else(|| format!("Schedule '{}' not found", id))?;

    schedules.remove(idx);
    save_schedules_to_disk(&schedules)?;

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        manager.unschedule(&id).await?;
    }

    Ok(())
}

/// Toggle a schedule on/off
#[tauri::command]
pub async fn toggle_schedule(id: String, enabled: bool) -> Result<ScheduleConfig, String> {
    let mut schedules = load_schedules_from_disk()?;
    let idx = schedules.iter().position(|s| s.id == id)
        .ok_or_else(|| format!("Schedule '{}' not found", id))?;

    schedules[idx].enabled = enabled;
    save_schedules_to_disk(&schedules)?;

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        if enabled {
            manager.schedule_from_config(&schedules[idx]).await?;
        } else {
            manager.unschedule(&id).await?;
        }
    }

    Ok(schedules[idx].clone())
}
