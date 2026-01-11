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

    // Schedule all enabled agents
    manager.schedule_all_agents().await?;

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
// Session Recovery
// ========================

/// Recover orphaned cron sessions (called at app startup after init_cronos)
pub async fn recover_orphaned_cron_sessions() -> Result<CronRecoveryResult, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.recover_orphaned_cron_sessions().await
}

/// List orphaned cron sessions (for UI display)
#[tauri::command]
pub async fn list_orphaned_cron_sessions() -> Result<Vec<OrphanedSessionInfo>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let orphaned = manager.find_orphaned_cron_sessions()?;
    Ok(orphaned.into_iter().map(|s| OrphanedSessionInfo {
        run_id: s.run_log.run_id,
        agent_name: s.run_log.agent_name,
        session_name: s.run_log.session_name,
        started_at: s.run_log.started_at,
        session_alive: s.session_alive,
    }).collect())
}

/// Manually recover orphaned cron sessions (Tauri command)
#[tauri::command]
pub async fn recover_cron_sessions() -> Result<CronRecoveryResult, String> {
    recover_orphaned_cron_sessions().await
}

/// Info about an orphaned session (for UI)
#[derive(Clone, Debug, serde::Serialize)]
pub struct OrphanedSessionInfo {
    pub run_id: String,
    pub agent_name: String,
    pub session_name: Option<String>,
    pub started_at: String,
    pub session_alive: bool,
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
            group: config.group.clone(),
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
// Group Management
// ========================

#[tauri::command]
pub async fn list_cron_groups() -> Result<Vec<CronAgentGroup>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.load_groups()
}

#[tauri::command]
pub async fn get_cron_group(group_id: String) -> Result<CronAgentGroup, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_group(&group_id)
}

#[tauri::command]
pub async fn create_cron_group(group: CronAgentGroup) -> Result<(), String> {
    // Validate group ID format
    if !group.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Group ID must contain only lowercase letters, digits, and hyphens".to_string());
    }
    if group.id.is_empty() {
        return Err("Group ID is required".to_string());
    }
    if group.name.is_empty() {
        return Err("Group name is required".to_string());
    }

    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.create_group(group)
}

#[tauri::command]
pub async fn update_cron_group(group: CronAgentGroup) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.update_group(group)
}

#[tauri::command]
pub async fn delete_cron_group(group_id: String) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.delete_group(&group_id)
}

#[tauri::command]
pub async fn set_agent_group(agent_name: String, group_id: Option<String>) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Validate group exists if provided
    if let Some(ref gid) = group_id {
        manager.get_group(gid)?;
    }

    // Update agent config
    let mut config = manager.get_agent(&agent_name).await?;
    config.group = group_id;
    manager.save_agent(&config).await
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

/// Trigger a cron agent from the scheduler (scheduled trigger)
pub async fn trigger_cron_agent_scheduled(name: String) -> Result<String, String> {
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

    // Execute (not spawned - let the caller handle spawning)
    let guard = CRONOS.read().await;
    if let Some(manager) = guard.as_ref() {
        executor::execute_cron_agent(
            &config,
            manager,
            RunTrigger::Scheduled,
            false,
            Some(output_sender),
            None,
        ).await?;
    }

    Ok(format!("Scheduled run completed for {}", name))
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
    // First check running processes
    let guard = CRONOS.read().await;
    if let Some(manager) = guard.as_ref() {
        let running = manager.list_running().await;
        for process in running {
            if process.run_id == run_id {
                // Read from the log file of the running process
                // Use from_utf8_lossy to handle corrupted log files gracefully
                return Ok(std::fs::read(&process.log_file)
                    .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                    .unwrap_or_else(|_| String::new()));
            }
        }
    }
    drop(guard);

    // Check completed runs
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
                                // Use from_utf8_lossy to handle corrupted log files gracefully
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

// ========================
// Idea Dispatch System
// ========================

/// Idea from ideas.jsonl
#[derive(Clone, Debug, serde::Deserialize)]
struct Idea {
    id: String,
    title: String,
    #[allow(dead_code)]
    description: String,
    status: String,
}

/// Review from inbox-reviews.jsonl
#[derive(Clone, Debug, serde::Deserialize)]
struct InboxReview {
    item_id: String,
    #[allow(dead_code)]
    review_status: String,
}

/// Result of dispatch operation
#[derive(Clone, Debug, serde::Serialize)]
pub struct DispatchResult {
    pub dispatched: Vec<String>,    // Idea IDs that were dispatched
    pub already_reviewed: usize,    // Count of ideas already reviewed
    pub already_processing: usize,  // Count of ideas being processed
    pub inactive: usize,            // Count of non-active ideas
}

/// Dispatch unprocessed ideas to cron-idea-processor agents
///
/// This is a scripted dispatcher (no AI needed):
/// 1. Read ideas.jsonl
/// 2. Read inbox-reviews.jsonl
/// 3. Find ideas without reviews
/// 4. Spawn cron-idea-processor for each with IDEA_ID env var
#[tauri::command]
pub async fn dispatch_ideas(app: AppHandle) -> Result<DispatchResult, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let feedback_dir = nolan_root.join(".state/feedback");

    // Read ideas
    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    // Read existing reviews
    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<InboxReview>(&reviews_path).unwrap_or_default();

    // Build set of already-reviewed idea IDs
    let reviewed_ids: std::collections::HashSet<_> = reviews.iter()
        .map(|r| r.item_id.as_str())
        .collect();

    // Get cronos manager
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Load processor config
    let processor_config = manager.get_agent("cron-idea-processor").await?;

    let mut result = DispatchResult {
        dispatched: Vec::new(),
        already_reviewed: 0,
        already_processing: 0,
        inactive: 0,
    };

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

    // Process each active idea
    for idea in ideas {
        // Skip non-active ideas
        if idea.status != "active" {
            result.inactive += 1;
            continue;
        }

        // Skip already-reviewed ideas
        if reviewed_ids.contains(idea.id.as_str()) {
            result.already_reviewed += 1;
            continue;
        }

        // Spawn processor with IDEA_ID
        let mut extra_env = executor::ExtraEnvVars::new();
        extra_env.insert("IDEA_ID".to_string(), idea.id.clone());
        extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

        let config = processor_config.clone();
        let sender = output_sender.clone();

        // Spawn in background
        tokio::spawn(async move {
            let guard = CRONOS.read().await;
            if let Some(manager) = guard.as_ref() {
                if let Err(e) = executor::execute_cron_agent_with_env(
                    &config,
                    manager,
                    RunTrigger::Manual,
                    false,
                    Some(sender),
                    None,
                    Some(extra_env),
                ).await {
                    eprintln!("Idea processor failed: {}", e);
                }
            }
        });

        result.dispatched.push(idea.id);
    }

    Ok(result)
}

/// Dispatch a single idea to cron-idea-processor
#[tauri::command]
pub async fn dispatch_single_idea(idea_id: String, app: AppHandle) -> Result<String, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let feedback_dir = nolan_root.join(".state/feedback");

    // Read ideas to get title
    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    let idea = ideas.iter()
        .find(|i| i.id == idea_id)
        .ok_or_else(|| format!("Idea {} not found", idea_id))?;

    // Get cronos manager
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Load processor config
    let processor_config = manager.get_agent("cron-idea-processor").await?;

    // Get output sender
    let output_sender = OUTPUT_SENDER.clone();

    // Setup event forwarding
    let app_clone = app.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app_clone.emit("cronos:output", &event);
        }
    });

    // Build env vars
    let mut extra_env = executor::ExtraEnvVars::new();
    extra_env.insert("IDEA_ID".to_string(), idea_id.clone());
    extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

    drop(guard);

    // Spawn in background
    let config = processor_config.clone();
    let sender = output_sender.clone();
    tokio::spawn(async move {
        let guard = CRONOS.read().await;
        if let Some(manager) = guard.as_ref() {
            if let Err(e) = executor::execute_cron_agent_with_env(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(sender),
                None,
                Some(extra_env),
            ).await {
                eprintln!("Idea processor failed: {}", e);
            }
        }
    });

    Ok(format!("Dispatched idea {} for processing", idea_id))
}

// ========================
// Accepted Idea Routing
// ========================

/// Review from inbox-reviews.jsonl (extended for routing)
#[derive(Clone, Debug, serde::Deserialize)]
struct ReviewForRouting {
    item_id: String,
    review_status: String,
    #[serde(default)]
    complexity: Option<String>,
    proposal: Option<ProposalForRouting>,
}

#[derive(Clone, Debug, serde::Deserialize)]
struct ProposalForRouting {
    title: String,
    summary: String,
    problem: String,
    solution: String,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    implementation_hints: Option<String>,
}

/// Result of routing an accepted idea
#[derive(Clone, Debug, serde::Serialize)]
pub struct RouteResult {
    pub idea_id: String,
    pub route: String,  // "project" or "implementer"
    pub detail: String, // project name or "triggered"
}

/// Route an accepted idea based on complexity
/// - High complexity → Create project
/// - Low/Medium complexity → Trigger cron-idea-implementer
pub async fn route_accepted_idea(idea_id: String) -> Result<RouteResult, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let feedback_dir = nolan_root.join(".state/feedback");

    // Read the idea to get title
    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;
    let idea = ideas.iter()
        .find(|i| i.id == idea_id)
        .ok_or_else(|| format!("Idea {} not found", idea_id))?;

    // Read the review to get complexity and proposal
    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<ReviewForRouting>(&reviews_path)?;
    let review = reviews.iter()
        .find(|r| r.item_id == idea_id)
        .ok_or_else(|| format!("Review for idea {} not found", idea_id))?;

    // Get complexity (default to medium if not set)
    let complexity = review.complexity.as_deref().unwrap_or("medium");

    match complexity {
        "low" | "medium" => {
            // Trigger cron-idea-implementer
            let guard = CRONOS.read().await;
            let manager = guard.as_ref().ok_or("Cronos not initialized")?;

            let config = manager.get_agent("cron-idea-implementer").await?;
            let output_sender = OUTPUT_SENDER.clone();

            let mut extra_env = executor::ExtraEnvVars::new();
            extra_env.insert("IDEA_ID".to_string(), idea_id.clone());
            extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

            // Spawn in background
            tokio::spawn(async move {
                let guard = CRONOS.read().await;
                if let Some(manager) = guard.as_ref() {
                    if let Err(e) = executor::execute_cron_agent_with_env(
                        &config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender),
                        None,
                        Some(extra_env),
                    ).await {
                        eprintln!("Idea implementer failed: {}", e);
                    }
                }
            });

            Ok(RouteResult {
                idea_id,
                route: "implementer".to_string(),
                detail: "triggered".to_string(),
            })
        }
        _ => {
            // High complexity → Create project
            let proposal = review.proposal.as_ref()
                .ok_or("Review has no proposal")?;

            // Generate project name from proposal title
            let project_name = proposal.title
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>()
                .split('-')
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("-")
                .chars()
                .take(50) // Limit length
                .collect::<String>()
                .trim_end_matches('-')
                .to_string();

            // Create project
            let project_path = crate::commands::projects::create_project(
                project_name.clone(),
                None, // Use default team
            ).await?;

            // Write spec file with proposal content
            let spec_content = format!(
r#"# {}

## Summary

{}

## Problem

{}

## Solution

{}
{}{}
---
*Generated from accepted idea: {}*
"#,
                proposal.title,
                proposal.summary,
                proposal.problem,
                proposal.solution,
                proposal.scope.as_ref().map(|s| format!("\n## Scope\n\n{}\n", s)).unwrap_or_default(),
                proposal.implementation_hints.as_ref().map(|h| format!("\n## Implementation Hints\n\n{}\n", h)).unwrap_or_default(),
                idea_id
            );

            let spec_path = std::path::Path::new(&project_path).join("SPEC.md");
            std::fs::write(&spec_path, spec_content)
                .map_err(|e| format!("Failed to write SPEC.md: {}", e))?;

            Ok(RouteResult {
                idea_id,
                route: "project".to_string(),
                detail: project_name,
            })
        }
    }
}

/// Dispatch unprocessed ideas via HTTP API (no AppHandle required)
pub async fn dispatch_ideas_api() -> Result<DispatchResult, String> {
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let feedback_dir = nolan_root.join(".state/feedback");

    // Read ideas
    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    // Read existing reviews
    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<InboxReview>(&reviews_path).unwrap_or_default();

    // Build set of already-reviewed idea IDs
    let reviewed_ids: std::collections::HashSet<_> = reviews.iter()
        .map(|r| r.item_id.as_str())
        .collect();

    // Get cronos manager
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Load processor config
    let processor_config = manager.get_agent("cron-idea-processor").await?;

    let mut result = DispatchResult {
        dispatched: Vec::new(),
        already_reviewed: 0,
        already_processing: 0,
        inactive: 0,
    };

    // Get output sender for streaming (no frontend to emit to)
    let output_sender = OUTPUT_SENDER.clone();

    // Process each active idea
    for idea in ideas {
        // Skip non-active ideas
        if idea.status != "active" {
            result.inactive += 1;
            continue;
        }

        // Skip already-reviewed ideas
        if reviewed_ids.contains(idea.id.as_str()) {
            result.already_reviewed += 1;
            continue;
        }

        // Spawn processor with IDEA_ID
        let mut extra_env = executor::ExtraEnvVars::new();
        extra_env.insert("IDEA_ID".to_string(), idea.id.clone());
        extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

        let config = processor_config.clone();
        let sender = output_sender.clone();

        // Spawn in background
        tokio::spawn(async move {
            let guard = CRONOS.read().await;
            if let Some(manager) = guard.as_ref() {
                if let Err(e) = executor::execute_cron_agent_with_env(
                    &config,
                    manager,
                    RunTrigger::Manual,
                    false,
                    Some(sender),
                    None,
                    Some(extra_env),
                ).await {
                    eprintln!("Idea processor failed: {}", e);
                }
            }
        });

        result.dispatched.push(idea.id);
    }

    Ok(result)
}

/// Read a JSONL file into a vector of items
fn read_jsonl_file<T: serde::de::DeserializeOwned>(path: &std::path::Path) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let mut items = Vec::new();
    for (line_num, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<T>(line) {
            Ok(item) => items.push(item),
            Err(e) => eprintln!("Warning: Failed to parse line {} in {}: {}", line_num + 1, path.display(), e),
        }
    }

    Ok(items)
}
