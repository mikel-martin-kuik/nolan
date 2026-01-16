//! scheduler/commands.rs
//!
//! Entry point for scheduler Tauri commands.
//! This module provides global state and re-exports commands from submodules.
//!
//! Submodules:
//! - commands_agent: Agent CRUD, groups, execution control
//! - commands_analyzer: Post-run analyzer logic
//! - commands_history: Run history, session recovery, health monitoring
//! - commands_ideas: Idea dispatch and routing
//! - commands_pipeline: QA, merge, and pipeline operations
//! - commands_schedules: Schedule CRUD operations

use tokio::sync::broadcast;

use super::pipeline::PipelineManager;
use super::types::*;

// === GLOBAL STATE ===

/// Global scheduler manager instance
pub static SCHEDULER: once_cell::sync::Lazy<tokio::sync::RwLock<Option<super::SchedulerManager>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::RwLock::new(None));

/// Global output broadcast channel for real-time streaming
pub static OUTPUT_SENDER: once_cell::sync::Lazy<broadcast::Sender<ScheduledOutputEvent>> =
    once_cell::sync::Lazy::new(|| {
        let (tx, _) = broadcast::channel(1000);
        tx
    });

/// Helper to get a fresh PipelineManager
pub fn get_pipeline_manager_sync() -> Result<PipelineManager, String> {
    let data_root = crate::utils::paths::get_nolan_data_root()?;
    Ok(PipelineManager::new(&data_root))
}

// === LIFECYCLE ===

/// Initialize scheduler manager (called at app startup)
pub async fn init_scheduler() -> Result<(), String> {
    let manager = super::SchedulerManager::new().await?;
    manager.start().await?;
    manager.schedule_all_agents().await?;

    let missed = manager.check_missed_runs().await?;
    for (agent_name, policy) in missed {
        if policy == CatchUpPolicy::RunOnce || policy == CatchUpPolicy::RunAll {
            println!("[Scheduler] Catching up missed run for: {}", agent_name);
        }
    }

    *SCHEDULER.write().await = Some(manager);
    Ok(())
}

/// Shutdown scheduler manager (called at app close)
pub async fn shutdown_scheduler() -> Result<(), String> {
    let mut guard = SCHEDULER.write().await;
    if let Some(manager) = guard.as_mut() {
        manager.shutdown().await?;
    }
    Ok(())
}

// === RE-EXPORTS FROM SUBMODULES ===

// Agent CRUD, groups, execution
pub use super::commands_agent::{
    list_scheduled_agents,
    get_scheduled_agent,
    create_scheduled_agent,
    update_scheduled_agent,
    delete_scheduled_agent,
    toggle_scheduled_agent,
    test_scheduled_agent,
    list_scheduled_groups,
    get_scheduled_group,
    create_scheduled_group,
    update_scheduled_group,
    delete_scheduled_group,
    set_agent_group,
    trigger_scheduled_agent,
    trigger_scheduled_agent_api,
    trigger_scheduled_agent_scheduled,
    cancel_scheduled_agent,
    trigger_predefined_agent,
    list_agent_commands,
    AgentCommand,
    get_running_agents,
    RunningAgentInfo,
    read_scheduled_agent_claude_md,
    write_scheduled_agent_claude_md,
};

// Analyzer
pub use super::commands_analyzer::{
    trigger_post_run_analyzer,
    process_analyzer_verdict,
    trigger_analyzer_for_run,
    VerdictProcessingResult,
};

// History, recovery, health
pub use super::commands_history::{
    get_scheduled_run_history,
    get_scheduled_run_log,
    recover_orphaned_scheduled_sessions,
    list_orphaned_scheduled_sessions,
    recover_scheduled_sessions,
    OrphanedSessionInfo,
    relaunch_scheduled_session,
    relaunch_scheduled_session_api,
    get_scheduler_health,
    get_agent_stats,
    subscribe_scheduled_output,
};

// Ideas
pub use super::commands_ideas::{
    dispatch_ideas,
    dispatch_single_idea,
    dispatch_ideas_api,
    route_accepted_idea,
    DispatchResult,
    RouteResult,
};

// Pipeline
pub use super::commands_pipeline::{
    trigger_worktree_merger,
    trigger_merge_for_run,
    list_pipelines,
    get_pipeline,
    list_pipeline_definitions,
    get_pipeline_definition,
    get_default_pipeline_definition,
    save_pipeline_definition,
    delete_pipeline_definition,
    skip_pipeline_stage,
    abort_pipeline,
    complete_pipeline,
    retry_pipeline_stage,
    skip_pipeline_stage_cmd,
    abort_pipeline_cmd,
    complete_pipeline_cmd,
};

// Schedules
pub use super::commands_schedules::{
    validate_cron,
    describe_cron,
    calculate_next_run,
    get_schedule_next_runs,
    describe_schedule_expression,
    CronDescription,
    list_schedules,
    create_schedule,
    update_schedule,
    delete_schedule,
    toggle_schedule,
};
