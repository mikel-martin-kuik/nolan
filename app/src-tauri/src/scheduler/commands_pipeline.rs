//! scheduler/commands_pipeline.rs
//!
//! Pipeline workflow logic for QA validation and merge operations.
//! Handles the automated workflow after implementation completes.
//!
//! Entry points:
//! - `trigger_qa_then_merge()` - Start QA validation, then merge on success
//! - `trigger_worktree_merger()` - Trigger merge agent directly
//! - Pipeline stage commands (skip, retry, abort)

use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use super::executor;
use super::pipeline::PipelineManager;
use super::types::*;
use super::commands::{SCHEDULER, OUTPUT_SENDER, get_pipeline_manager_sync};

/// Trigger QA validation, then merger if QA passes
pub async fn trigger_qa_then_merge(
    worktree_path: String,
    worktree_branch: String,
    base_commit: Option<String>,
    agent_name: String,
    output_sender: broadcast::Sender<ScheduledOutputEvent>,
    pipeline_id: Option<String>,
) {
    println!(
        "[Scheduler] trigger_qa_then_merge called: path={}, branch={}",
        worktree_path, worktree_branch
    );

    let _ = output_sender.send(ScheduledOutputEvent {
        run_id: String::new(),
        agent_name: agent_name.clone(),
        event_type: OutputEventType::Status,
        content: format!("Triggering QA validation for branch: {}", worktree_branch),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(
                pid,
                PipelineStageType::Qa,
                PipelineStageStatus::Running,
                None,
                None,
            );
        }
    }

    let mut qa_env = executor::ExtraEnvVars::new();
    qa_env.insert("WORKTREE_PATH".to_string(), worktree_path.clone());
    qa_env.insert("WORKTREE_BRANCH".to_string(), worktree_branch.clone());
    if let Some(ref commit) = base_commit {
        qa_env.insert("BASE_COMMIT".to_string(), commit.clone());
    }
    if let Some(ref pid) = pipeline_id {
        qa_env.insert("PIPELINE_ID".to_string(), pid.clone());
    }

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        match manager.get_agent("qa-validation").await {
            Ok(qa_config) => {
                drop(guard);

                let guard = SCHEDULER.read().await;
                if let Some(manager) = guard.as_ref() {
                    match executor::execute_cron_agent_with_env(
                        &qa_config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender.clone()),
                        None,
                        Some(qa_env),
                        None,
                    )
                    .await
                    {
                        Ok(qa_run_log) => {
                            let _ = output_sender.send(ScheduledOutputEvent {
                                run_id: qa_run_log.run_id.clone(),
                                agent_name: "qa-validation".to_string(),
                                event_type: OutputEventType::Complete,
                                content: format!("QA validation completed: {:?}", qa_run_log.status),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });

                            if qa_run_log.status == ScheduledRunStatus::Success {
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let _ = pm.update_stage(
                                            pid,
                                            PipelineStageType::Qa,
                                            PipelineStageStatus::Success,
                                            Some(&qa_run_log.run_id),
                                            None,
                                        );
                                    }
                                }

                                trigger_worktree_merger(
                                    worktree_path,
                                    worktree_branch,
                                    output_sender,
                                    pipeline_id,
                                )
                                .await;
                            } else {
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let _ = pm.update_stage(
                                            pid,
                                            PipelineStageType::Qa,
                                            PipelineStageStatus::Failed,
                                            Some(&qa_run_log.run_id),
                                            None,
                                        );
                                    }
                                }

                                let _ = output_sender.send(ScheduledOutputEvent {
                                    run_id: qa_run_log.run_id,
                                    agent_name,
                                    event_type: OutputEventType::Status,
                                    content: "Skipping merge: QA validation did not pass".to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                });
                            }
                        }
                        Err(e) => {
                            eprintln!("[Scheduler] QA validation failed: {}", e);
                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let _ = pm.update_stage(
                                        pid,
                                        PipelineStageType::Qa,
                                        PipelineStageStatus::Failed,
                                        None,
                                        None,
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[Scheduler] qa-validation agent not found: {}", e);
            }
        }
    }
}

/// Trigger the worktree merger agent
pub async fn trigger_worktree_merger(
    worktree_path: String,
    worktree_branch: String,
    output_sender: broadcast::Sender<ScheduledOutputEvent>,
    pipeline_id: Option<String>,
) {
    println!(
        "[Scheduler] trigger_worktree_merger called: path={}, branch={}",
        worktree_path, worktree_branch
    );

    let _ = output_sender.send(ScheduledOutputEvent {
        run_id: String::new(),
        agent_name: "merge-changes".to_string(),
        event_type: OutputEventType::Status,
        content: format!("Triggering worktree merger for branch: {}", worktree_branch),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(
                pid,
                PipelineStageType::Merger,
                PipelineStageStatus::Running,
                None,
                None,
            );
        }
    }

    let repo_path = match crate::utils::paths::get_nolan_root() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(e) => {
            eprintln!("[Scheduler] Failed to get nolan root for merger: {}", e);
            return;
        }
    };

    let mut extra_env = executor::ExtraEnvVars::new();
    extra_env.insert("WORKTREE_PATH".to_string(), worktree_path);
    extra_env.insert("WORKTREE_BRANCH".to_string(), worktree_branch);
    extra_env.insert("BASE_BRANCH".to_string(), "main".to_string());
    extra_env.insert("REPO_PATH".to_string(), repo_path);
    if let Some(ref pid) = pipeline_id {
        extra_env.insert("PIPELINE_ID".to_string(), pid.clone());
    }

    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        match manager.get_agent("merge-changes").await {
            Ok(merger_config) => {
                drop(guard);

                let guard = SCHEDULER.read().await;
                if let Some(manager) = guard.as_ref() {
                    match executor::execute_cron_agent_with_env(
                        &merger_config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender.clone()),
                        None,
                        Some(extra_env),
                        None,
                    )
                    .await
                    {
                        Ok(merger_run_log) => {
                            let _ = output_sender.send(ScheduledOutputEvent {
                                run_id: merger_run_log.run_id.clone(),
                                agent_name: "merge-changes".to_string(),
                                event_type: OutputEventType::Complete,
                                content: format!("Merger completed: {:?}", merger_run_log.status),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });

                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let stage_status = match merger_run_log.status {
                                        ScheduledRunStatus::Success => PipelineStageStatus::Success,
                                        _ => PipelineStageStatus::Failed,
                                    };
                                    let _ = pm.update_stage(
                                        pid,
                                        PipelineStageType::Merger,
                                        stage_status,
                                        Some(&merger_run_log.run_id),
                                        None,
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[Scheduler] Worktree merger failed: {}", e);
                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let _ = pm.update_stage(
                                        pid,
                                        PipelineStageType::Merger,
                                        PipelineStageStatus::Failed,
                                        None,
                                        None,
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[Scheduler] merge-changes agent not found: {}", e);
            }
        }
    }
}

/// Manually trigger QA validation for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_qa_for_run(run_id: String, app: AppHandle) -> Result<String, String> {
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut run_log: Option<ScheduledRunLog> = None;

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
                                run_log = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() {
            break;
        }
    }

    let run_log = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    let worktree_path = run_log
        .worktree_path
        .ok_or("Run has no worktree path - QA requires a worktree")?;
    let worktree_branch = run_log
        .worktree_branch
        .ok_or("Run has no worktree branch - QA requires a branch")?;

    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("scheduler:output", &event);
        }
    });

    trigger_qa_then_merge(
        worktree_path.clone(),
        worktree_branch.clone(),
        run_log.base_commit,
        run_log.agent_name,
        output_sender,
        None,
    )
    .await;

    Ok(format!("Triggered QA validation for branch {}", worktree_branch))
}

/// Manually trigger worktree merge for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_merge_for_run(run_id: String, app: AppHandle) -> Result<String, String> {
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut run_log: Option<ScheduledRunLog> = None;

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
                                run_log = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() {
            break;
        }
    }

    let run_log = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    let worktree_path = run_log
        .worktree_path
        .ok_or("Run has no worktree path")?;
    let worktree_branch = run_log
        .worktree_branch
        .ok_or("Run has no worktree branch")?;

    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("scheduler:output", &event);
        }
    });

    trigger_worktree_merger(
        worktree_path.clone(),
        worktree_branch.clone(),
        output_sender,
        None,
    )
    .await;

    Ok(format!("Triggered merge for branch {}", worktree_branch))
}

// === PIPELINE API COMMANDS ===

/// List all pipelines
#[tauri::command]
pub async fn list_pipelines(status: Option<PipelineStatus>) -> Result<Vec<Pipeline>, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.list_pipelines(status)
}

/// Get a specific pipeline by ID
#[tauri::command]
pub async fn get_pipeline(id: String) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.get_pipeline(&id)
}

/// List all available pipeline definitions
#[tauri::command]
pub async fn list_pipeline_definitions() -> Result<Vec<PipelineDefinition>, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.list_definitions()
}

/// Get a specific pipeline definition by name
#[tauri::command]
pub async fn get_pipeline_definition(name: String) -> Result<PipelineDefinition, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.get_definition(&name)
}

/// Get the default pipeline definition
#[tauri::command]
pub async fn get_default_pipeline_definition() -> Result<PipelineDefinition, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.get_default_definition()
}

/// Skip a pipeline stage
#[tauri::command(rename_all = "snake_case")]
pub async fn skip_pipeline_stage(
    run_id: String,
    reason: Option<String>,
) -> Result<ScheduledRunLog, String> {
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut run_log: Option<(ScheduledRunLog, std::path::PathBuf)> = None;

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
                                run_log = Some((log, path));
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() {
            break;
        }
    }

    let (mut log, path) = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    if log.status == ScheduledRunStatus::Running {
        return Err("Cannot skip a running stage".to_string());
    }
    if log.status == ScheduledRunStatus::Success {
        return Err("Cannot skip an already successful stage".to_string());
    }

    log.status = ScheduledRunStatus::Skipped;
    log.error = reason.or(Some("Manually skipped".to_string()));
    if log.completed_at.is_none() {
        log.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    let updated_json = serde_json::to_string_pretty(&log)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, updated_json)
        .map_err(|e| format!("Failed to write: {}", e))?;

    let _ = OUTPUT_SENDER.send(ScheduledOutputEvent {
        run_id: log.run_id.clone(),
        agent_name: log.agent_name.clone(),
        event_type: OutputEventType::Status,
        content: "Stage manually skipped".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok(log)
}

/// Abort an entire pipeline
#[tauri::command(rename_all = "snake_case")]
pub async fn abort_pipeline(
    pipeline_id: String,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut cancelled_runs: Vec<String> = Vec::new();
    let mut cancelled_agents: Vec<String> = Vec::new();

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

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
                        if let Ok(mut log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                            let matches = log
                                .worktree_branch
                                .as_ref()
                                .map(|b| b.contains(&pipeline_id))
                                .unwrap_or(false)
                                || log.run_id.contains(&pipeline_id);

                            if matches {
                                if log.status == ScheduledRunStatus::Running {
                                    if let Err(e) = executor::cancel_scheduled_agent(manager, &log.agent_name).await {
                                        eprintln!("Failed to cancel {}: {}", log.agent_name, e);
                                    } else {
                                        cancelled_agents.push(log.agent_name.clone());
                                    }
                                }

                                if log.status != ScheduledRunStatus::Success
                                    && log.status != ScheduledRunStatus::Cancelled
                                    && log.status != ScheduledRunStatus::Skipped
                                {
                                    log.status = ScheduledRunStatus::Cancelled;
                                    log.error = reason.clone().or(Some("Pipeline aborted".to_string()));
                                    if log.completed_at.is_none() {
                                        log.completed_at = Some(chrono::Utc::now().to_rfc3339());
                                    }

                                    if let Ok(updated_json) = serde_json::to_string_pretty(&log) {
                                        let _ = std::fs::write(&path, updated_json);
                                    }

                                    cancelled_runs.push(log.run_id.clone());

                                    let _ = OUTPUT_SENDER.send(ScheduledOutputEvent {
                                        run_id: log.run_id.clone(),
                                        agent_name: log.agent_name.clone(),
                                        event_type: OutputEventType::Status,
                                        content: "Pipeline aborted".to_string(),
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "cancelled_runs": cancelled_runs,
        "cancelled_agents": cancelled_agents,
        "reason": reason.unwrap_or_else(|| "Pipeline aborted".to_string())
    }))
}

/// Manually mark a pipeline as completed
#[tauri::command(rename_all = "snake_case")]
pub async fn complete_pipeline(
    pipeline_id: String,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    let pm = get_pipeline_manager_sync()?;
    let reason_str = reason.unwrap_or_else(|| "Manually completed".to_string());
    let pipeline = pm.complete_pipeline(&pipeline_id, &reason_str)?;

    Ok(serde_json::json!({
        "pipeline_id": pipeline.id,
        "status": pipeline.status,
        "reason": reason_str
    }))
}

/// Retry a failed pipeline stage
#[tauri::command]
pub async fn retry_pipeline_stage(
    pipeline_id: String,
    stage_type: PipelineStageType,
) -> Result<String, String> {
    let pm = get_pipeline_manager_sync()?;
    let pipeline = pm.get_pipeline(&pipeline_id)?;

    let _stage = pipeline
        .stages
        .iter()
        .find(|s| s.stage_type == stage_type)
        .ok_or("Stage not found")?;

    pm.update_stage(
        &pipeline_id,
        stage_type.clone(),
        PipelineStageStatus::Pending,
        None,
        None,
    )?;

    let output_sender = OUTPUT_SENDER.clone();
    let pid = pipeline_id.clone();

    match stage_type {
        PipelineStageType::Implementer => {
            // For implementer retry, would need to relaunch session
            // This requires commands_history module, so we just return info
        }
        PipelineStageType::Analyzer => {
            if let Some(impl_stage) = pipeline
                .stages
                .iter()
                .find(|s| s.stage_type == PipelineStageType::Implementer)
            {
                if let Some(run_id) = &impl_stage.run_id {
                    let analyzed_run_id = run_id.clone();
                    tokio::spawn(async move {
                        let mut env_vars = HashMap::new();
                        env_vars.insert("ANALYZED_RUN_ID".to_string(), analyzed_run_id.clone());
                        env_vars.insert("ANALYZED_AGENT".to_string(), "idea-implementer".to_string());
                        env_vars.insert("PIPELINE_ID".to_string(), pid.clone());

                        let trigger_info = executor::AnalyzerTriggerInfo {
                            analyzer_agent: "implementer-analyzer".to_string(),
                            env_vars,
                        };
                        super::commands_analyzer::trigger_post_run_analyzer(trigger_info, output_sender, Some(pid)).await;
                    });
                }
            }
        }
        PipelineStageType::Qa => {
            if let (Some(wt_path), Some(wt_branch)) = (&pipeline.worktree_path, &pipeline.worktree_branch) {
                let wt_path = wt_path.clone();
                let wt_branch = wt_branch.clone();
                let base_commit = pipeline.base_commit.clone();
                tokio::spawn(async move {
                    trigger_qa_then_merge(wt_path, wt_branch, base_commit, "idea-implementer".to_string(), output_sender, Some(pid)).await;
                });
            }
        }
        PipelineStageType::Merger => {
            if let (Some(wt_path), Some(wt_branch)) = (&pipeline.worktree_path, &pipeline.worktree_branch) {
                let wt_path = wt_path.clone();
                let wt_branch = wt_branch.clone();
                tokio::spawn(async move {
                    trigger_worktree_merger(wt_path, wt_branch, output_sender, Some(pid)).await;
                });
            }
        }
    }

    Ok(format!("Retrying {:?} stage for pipeline {}", stage_type, pipeline_id))
}

/// Skip a pipeline stage command
#[tauri::command]
pub async fn skip_pipeline_stage_cmd(
    pipeline_id: String,
    stage_type: PipelineStageType,
    reason: String,
) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;
    let pipeline = pm.skip_stage(&pipeline_id, stage_type.clone(), &reason)?;

    let output_sender = OUTPUT_SENDER.clone();
    let pid = pipeline_id.clone();

    if stage_type == PipelineStageType::Qa {
        if let (Some(wt_path), Some(wt_branch)) = (&pipeline.worktree_path, &pipeline.worktree_branch) {
            let wt_path = wt_path.clone();
            let wt_branch = wt_branch.clone();
            tokio::spawn(async move {
                trigger_worktree_merger(wt_path, wt_branch, output_sender, Some(pid)).await;
            });
        }
    }

    pm.get_pipeline(&pipeline_id)
}

/// Abort an entire pipeline command
#[tauri::command]
pub async fn abort_pipeline_cmd(pipeline_id: String, reason: String) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;
    let pipeline = pm.get_pipeline(&pipeline_id)?;

    for stage in &pipeline.stages {
        if stage.status == PipelineStageStatus::Running {
            let guard = SCHEDULER.read().await;
            if let Some(manager) = guard.as_ref() {
                let _ = executor::cancel_scheduled_agent(manager, &stage.agent_name).await;
            }
        }
    }

    pm.abort_pipeline(&pipeline_id, &reason)
}

/// Manually mark a pipeline as completed command
#[tauri::command]
pub async fn complete_pipeline_cmd(pipeline_id: String, reason: String) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.complete_pipeline(&pipeline_id, &reason)
}
