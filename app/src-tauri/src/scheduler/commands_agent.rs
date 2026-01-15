//! scheduler/commands_agent.rs
//!
//! Agent CRUD operations, group management, and execution control.
//! Handles creating, updating, deleting, and triggering scheduled agents.
//!
//! Entry points:
//! - Agent CRUD: list, get, create, update, delete, toggle
//! - Group management: list, get, create, update, delete
//! - Execution: trigger, cancel, get running agents

use tauri::{AppHandle, Emitter};

use super::executor;
use super::types::*;
use super::commands::{SCHEDULER, OUTPUT_SENDER};
use super::commands_schedules::{validate_cron, describe_cron, calculate_next_run};
use super::commands_analyzer::trigger_post_run_analyzer;

// === AGENT CRUD ===

#[tauri::command]
pub async fn list_scheduled_agents() -> Result<Vec<ScheduledAgentInfo>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let configs = manager.load_agents().await?;
    let mut infos = Vec::new();

    for config in configs {
        let last_run = manager
            .get_run_history(Some(&config.name), 1)
            .await?
            .into_iter()
            .next();

        let is_running = manager.is_running(&config.name).await;
        let current_run_id = if is_running {
            manager.get_running_process(&config.name).await.map(|p| p.run_id)
        } else {
            None
        };

        let health = manager.calculate_agent_health(&config.name).await;
        let stats = manager.calculate_agent_stats(&config.name, 50).await;
        let agent_state = manager.get_agent_state(&config.name).await;

        let (schedule_str, cron_expr, next_run) = match &config.schedule {
            Some(sched) => (
                describe_cron(&sched.cron),
                sched.cron.clone(),
                calculate_next_run(&sched.cron),
            ),
            None => (String::new(), String::new(), None),
        };

        infos.push(ScheduledAgentInfo {
            name: config.name.clone(),
            description: config.description.clone(),
            model: config.model.clone(),
            enabled: config.enabled,
            role: config.effective_role(),
            schedule: schedule_str,
            cron_expression: cron_expr,
            next_run,
            last_run,
            group: config.group.clone(),
            is_running,
            current_run_id,
            consecutive_failures: agent_state.map(|s| s.consecutive_failures).unwrap_or(0),
            health,
            stats,
            event_trigger: config.event_trigger.clone(),
            invocation: config.invocation.clone(),
        });
    }

    Ok(infos)
}

#[tauri::command]
pub async fn get_scheduled_agent(name: String) -> Result<ScheduledAgentConfig, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.get_agent(&name).await
}

#[tauri::command]
pub async fn create_scheduled_agent(config: ScheduledAgentConfig) -> Result<(), String> {
    if !config.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Agent name must contain only lowercase letters, digits, and hyphens".to_string());
    }

    if config.has_schedule() {
        if let Some(ref sched) = config.schedule {
            validate_cron(&sched.cron)?;
        } else if let Some(ref triggers) = config.triggers {
            if let Some(ref sched) = triggers.schedule {
                validate_cron(&sched.cron)?;
            }
        }
    }

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.save_agent(&config).await?;

    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let claude_md = agents_dir.join(&config.name).join("CLAUDE.md");

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
pub async fn update_scheduled_agent(name: String, config: ScheduledAgentConfig) -> Result<(), String> {
    if config.name != name {
        return Err("Cannot change agent name".to_string());
    }

    if config.has_schedule() {
        let triggers = config.effective_triggers();
        if let Some(ref sched) = triggers.schedule {
            validate_cron(&sched.cron)?;
        }
    }

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.save_agent(&config).await
}

#[tauri::command]
pub async fn delete_scheduled_agent(name: String) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    if manager.is_running(&name).await {
        return Err("Cannot delete running agent. Stop it first.".to_string());
    }

    manager.delete_agent(&name).await
}

#[tauri::command]
pub async fn toggle_scheduled_agent(name: String, enabled: bool) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let mut config = manager.get_agent(&name).await?;
    config.enabled = enabled;
    manager.save_agent(&config).await
}

#[tauri::command]
pub async fn test_scheduled_agent(name: String) -> Result<TestRunResult, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&name).await?;

    let start = std::time::Instant::now();
    let result = executor::execute_cron_agent_simple(&config, true).await;
    let duration = start.elapsed().as_secs() as u32;

    match result {
        Ok(log) => Ok(TestRunResult {
            success: log.status == ScheduledRunStatus::Success,
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

// === GROUP MANAGEMENT ===

#[tauri::command]
pub async fn list_scheduled_groups() -> Result<Vec<ScheduledAgentGroup>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.load_groups()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_scheduled_group(group_id: String) -> Result<ScheduledAgentGroup, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.get_group(&group_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_scheduled_group(group: ScheduledAgentGroup) -> Result<(), String> {
    if !group.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Group ID must contain only lowercase letters, digits, and hyphens".to_string());
    }
    if group.id.is_empty() {
        return Err("Group ID is required".to_string());
    }
    if group.name.is_empty() {
        return Err("Group name is required".to_string());
    }

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.create_group(group)
}

#[tauri::command]
pub async fn update_scheduled_group(group: ScheduledAgentGroup) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.update_group(group)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_scheduled_group(group_id: String) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    manager.delete_group(&group_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_agent_group(agent_name: String, group_id: Option<String>) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    if let Some(ref gid) = group_id {
        manager.get_group(gid)?;
    }

    let mut config = manager.get_agent(&agent_name).await?;
    config.group = group_id;
    manager.save_agent(&config).await
}

// === EXECUTION CONTROL ===

#[tauri::command]
pub async fn trigger_scheduled_agent(name: String, app: AppHandle) -> Result<String, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&name).await?;

    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    let output_sender = OUTPUT_SENDER.clone();

    let app_clone = app.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app_clone.emit("scheduler:output", &event);
        }
    });

    let agent_name = name.clone();
    tokio::spawn(async move {
        let guard = SCHEDULER.read().await;
        if let Some(manager) = guard.as_ref() {
            match executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender.clone()),
                None,
            )
            .await
            {
                Ok(run_log) => {
                    if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                        trigger_post_run_analyzer(trigger_info, output_sender, None).await;
                    }
                }
                Err(e) => eprintln!("Scheduled agent {} failed: {}", agent_name, e),
            }
        }
    });

    Ok(format!("Triggered {}", name))
}

/// Trigger a cron agent via HTTP API (no AppHandle required)
pub async fn trigger_scheduled_agent_api(name: String) -> Result<String, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&name).await?;

    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    let output_sender = OUTPUT_SENDER.clone();

    let agent_name = name.clone();
    tokio::spawn(async move {
        let guard = SCHEDULER.read().await;
        if let Some(manager) = guard.as_ref() {
            match executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender.clone()),
                None,
            )
            .await
            {
                Ok(run_log) => {
                    if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                        trigger_post_run_analyzer(trigger_info, output_sender, None).await;
                    }
                }
                Err(e) => eprintln!("Scheduled agent {} failed: {}", agent_name, e),
            }
        }
    });

    Ok(format!("Triggered {}", name))
}

/// Trigger a cron agent from the scheduler (scheduled trigger)
pub async fn trigger_scheduled_agent_scheduled(name: String) -> Result<String, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&name).await?;

    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    let output_sender = OUTPUT_SENDER.clone();

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        let run_log = executor::execute_cron_agent(
            &config,
            manager,
            RunTrigger::Scheduled,
            false,
            Some(output_sender.clone()),
            None,
        )
        .await?;

        if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
            trigger_post_run_analyzer(trigger_info, output_sender, None).await;
        }
    }

    Ok(format!("Scheduled run completed for {}", name))
}

#[tauri::command]
pub async fn cancel_scheduled_agent(name: String) -> Result<(), String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    executor::cancel_scheduled_agent(manager, &name).await
}

// === PREDEFINED AGENT COMMANDS ===

#[tauri::command]
pub async fn trigger_predefined_agent(name: String, app: AppHandle) -> Result<String, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&name).await?;

    if !config.has_invocation() {
        return Err(format!("Agent '{}' is not an invocable agent", name));
    }

    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    trigger_scheduled_agent(name, app).await
}

#[tauri::command]
pub async fn list_agent_commands() -> Result<Vec<AgentCommand>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let agents = manager.load_agents().await?;
    let commands: Vec<AgentCommand> = agents
        .iter()
        .filter(|a| a.has_invocation())
        .filter_map(|a| {
            a.invocation.as_ref().and_then(|inv| {
                inv.command.as_ref().map(|cmd| AgentCommand {
                    command: cmd.clone(),
                    agent_name: a.name.clone(),
                    description: a.description.clone(),
                    icon: inv.icon.clone(),
                })
            })
        })
        .collect();

    Ok(commands)
}

#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AgentCommand {
    pub command: String,
    pub agent_name: String,
    pub description: String,
    pub icon: Option<String>,
}

#[tauri::command]
pub async fn get_running_agents() -> Result<Vec<RunningAgentInfo>, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let running = manager.list_running().await;
    Ok(running
        .into_iter()
        .map(|p| RunningAgentInfo {
            run_id: p.run_id,
            agent_name: p.agent_name,
            started_at: p.started_at.to_rfc3339(),
            duration_secs: (chrono::Utc::now() - p.started_at).num_seconds() as u32,
        })
        .collect())
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunningAgentInfo {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: String,
    pub duration_secs: u32,
}

// === AGENT INSTRUCTIONS ===

const ROLE_SUBDIRS: &[&str] = &[
    "implementers", "analyzers", "testers", "mergers", "builders",
    "scanners", "indexers", "monitors", "researchers", "planners", "free",
];

fn find_agent_dir(name: &str) -> Result<std::path::PathBuf, String> {
    let agents_dir = crate::utils::paths::get_agents_dir()?;

    let flat_path = agents_dir.join(name);
    if flat_path.exists() && flat_path.is_dir() {
        return Ok(flat_path);
    }

    for role_dir in ROLE_SUBDIRS {
        let role_path = agents_dir.join(role_dir).join(name);
        if role_path.exists() && role_path.is_dir() {
            return Ok(role_path);
        }
    }

    let teams_dir = crate::utils::paths::get_teams_dir()?;
    if teams_dir.exists() {
        if let Ok(team_entries) = std::fs::read_dir(&teams_dir) {
            for team_entry in team_entries.flatten() {
                let team_path = team_entry.path();
                if team_path.is_dir() {
                    let team_agent_path = team_path.join("agents").join(name);
                    if team_agent_path.exists() && team_agent_path.is_dir() {
                        return Ok(team_agent_path);
                    }
                }
            }
        }
    }

    Err(format!("Agent '{}' not found", name))
}

#[tauri::command]
pub async fn read_scheduled_agent_claude_md(name: String) -> Result<String, String> {
    let agent_dir = find_agent_dir(&name)?;
    let path = agent_dir.join("CLAUDE.md");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

#[tauri::command]
pub async fn write_scheduled_agent_claude_md(name: String, content: String) -> Result<(), String> {
    let agent_dir = find_agent_dir(&name)?;
    let path = agent_dir.join("CLAUDE.md");
    std::fs::write(&path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
}
