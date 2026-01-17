//! scheduler/commands_analyzer.rs
//!
//! Post-run analyzer logic for scheduled agents.
//! Handles triggering analyzers after agent runs complete,
//! processing verdicts, and triggering follow-up actions.
//!
//! Entry points:
//! - `trigger_post_run_analyzer()` - Trigger analyzer for a completed run
//! - `process_analyzer_verdict()` - Process verdict and update run log
//! - `trigger_analyzer_for_run()` - Manual analyzer trigger command

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use super::executor;
use super::types::*;
use super::commands::{SCHEDULER, OUTPUT_SENDER, get_pipeline_manager_sync};
use super::commands_pipeline::trigger_worktree_merger;

/// Result of processing an analyzer verdict
pub struct VerdictProcessingResult {
    pub verdict_type: AnalyzerVerdictType,
    pub agent_name: String,
    pub worktree_path: Option<String>,
    pub worktree_branch: Option<String>,
    pub base_commit: Option<String>,
}

/// Trigger a post-run analyzer agent with the given context
pub async fn trigger_post_run_analyzer(
    trigger_info: executor::AnalyzerTriggerInfo,
    output_sender: broadcast::Sender<ScheduledOutputEvent>,
    pipeline_id: Option<String>,
) {
    let analyzed_run_id = trigger_info
        .env_vars
        .get("ANALYZED_RUN_ID")
        .cloned()
        .unwrap_or_default();
    let analyzed_agent = trigger_info
        .env_vars
        .get("ANALYZED_AGENT")
        .cloned()
        .unwrap_or_default();

    // Emit status event about triggering analyzer
    let _ = output_sender.send(ScheduledOutputEvent {
        run_id: analyzed_run_id.clone(),
        agent_name: analyzed_agent.clone(),
        event_type: OutputEventType::Status,
        content: format!(
            "Triggering post-run analyzer: {}",
            trigger_info.analyzer_agent
        ),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Update pipeline: analyzer stage starting
    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(
                pid,
                PipelineStageType::Analyzer,
                PipelineStageStatus::Running,
                None,
                None,
            );
        }
    }

    // Load and execute the analyzer agent
    let guard = SCHEDULER.read().await;
    if let Some(manager) = guard.as_ref() {
        if let Ok(analyzer_config) = manager.get_agent(&trigger_info.analyzer_agent).await {
            drop(guard);

            let guard = SCHEDULER.read().await;
            if let Some(manager) = guard.as_ref() {
                match executor::execute_cron_agent_with_env(
                    &analyzer_config,
                    manager,
                    RunTrigger::Manual,
                    false,
                    Some(output_sender.clone()),
                    None,
                    Some(trigger_info.env_vars),
                    None,
                )
                .await
                {
                    Ok(analyzer_run_log) => {
                        match process_analyzer_verdict(
                            &analyzed_run_id,
                            &analyzer_run_log.run_id,
                            &output_sender,
                        )
                        .await
                        {
                            Ok(verdict_result) => {
                                // Update pipeline: analyzer completed with verdict
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let verdict = AnalyzerVerdict {
                                            verdict: verdict_result.verdict_type.clone(),
                                            reason: "".to_string(),
                                            follow_up_prompt: None,
                                            findings: vec![],
                                            analyzer_run_id: Some(analyzer_run_log.run_id.clone()),
                                        };
                                        let _ = pm.update_stage(
                                            pid,
                                            PipelineStageType::Analyzer,
                                            PipelineStageStatus::Success,
                                            Some(&analyzer_run_log.run_id),
                                            Some(&verdict),
                                        );
                                    }
                                }

                                // If COMPLETE and has worktree, trigger QA validation then merge
                                println!("[Scheduler] Analyzer verdict: {:?}, worktree_path: {:?}, worktree_branch: {:?}",
                                    verdict_result.verdict_type,
                                    verdict_result.worktree_path,
                                    verdict_result.worktree_branch
                                );
                                if verdict_result.verdict_type == AnalyzerVerdictType::Complete {
                                    if let (Some(wt_path), Some(wt_branch)) = (
                                        verdict_result.worktree_path.clone(),
                                        verdict_result.worktree_branch.clone(),
                                    ) {
                                        println!(
                                            "[Scheduler] Triggering merge for {} on {}",
                                            wt_branch, wt_path
                                        );
                                        trigger_worktree_merger(
                                            wt_path,
                                            wt_branch,
                                            output_sender,
                                            pipeline_id,
                                        )
                                        .await;
                                    } else {
                                        eprintln!("[Scheduler] Skipping merge: worktree info missing");
                                        if let Some(ref pid) = pipeline_id {
                                            if let Ok(pm) = get_pipeline_manager_sync() {
                                                let _ = pm.skip_stage(pid, PipelineStageType::Merger, "No worktree");
                                            }
                                        }
                                    }
                                } else if verdict_result.verdict_type == AnalyzerVerdictType::Failed {
                                    if let Some(ref pid) = pipeline_id {
                                        if let Ok(pm) = get_pipeline_manager_sync() {
                                            let _ = pm.abort_pipeline(pid, "Analyzer verdict: FAILED");
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[Scheduler] Failed to process analyzer verdict: {}", e);
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let _ = pm.update_stage(
                                            pid,
                                            PipelineStageType::Analyzer,
                                            PipelineStageStatus::Failed,
                                            None,
                                            None,
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Scheduler] Post-run analyzer {} failed: {}", trigger_info.analyzer_agent, e);
                        if let Some(ref pid) = pipeline_id {
                            if let Ok(pm) = get_pipeline_manager_sync() {
                                let _ = pm.update_stage(
                                    pid,
                                    PipelineStageType::Analyzer,
                                    PipelineStageStatus::Failed,
                                    None,
                                    None,
                                );
                            }
                        }
                    }
                }
            }
        } else {
            eprintln!("[Scheduler] Post-run analyzer {} not found", trigger_info.analyzer_agent);
        }
    }
}

/// Process the analyzer verdict file and update the original run's log
pub async fn process_analyzer_verdict(
    analyzed_run_id: &str,
    analyzer_run_id: &str,
    output_sender: &broadcast::Sender<ScheduledOutputEvent>,
) -> Result<VerdictProcessingResult, String> {
    let state_dir = crate::utils::paths::get_state_dir()?;
    let verdict_file = state_dir
        .join("analyzer-verdicts")
        .join(format!("{}.json", analyzed_run_id));

    let verdict_content = std::fs::read_to_string(&verdict_file)
        .map_err(|e| format!("Failed to read verdict file: {}", e))?;

    let mut verdict: AnalyzerVerdict = serde_json::from_str(&verdict_content)
        .map_err(|e| format!("Failed to parse verdict JSON: {}", e))?;

    verdict.analyzer_run_id = Some(analyzer_run_id.to_string());

    let runs_dir = crate::utils::paths::get_scheduler_runs_dir()?;
    let mut result: Option<VerdictProcessingResult> = None;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if !date_entry.path().is_dir() {
            continue;
        }
        for file_entry in std::fs::read_dir(date_entry.path())
            .into_iter()
            .flatten()
            .flatten()
        {
            let path = file_entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(mut run_log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                        if run_log.run_id == analyzed_run_id {
                            run_log.analyzer_verdict = Some(verdict.clone());

                            let updated_json = serde_json::to_string_pretty(&run_log)
                                .map_err(|e| format!("Failed to serialize: {}", e))?;
                            std::fs::write(&path, updated_json)
                                .map_err(|e| format!("Failed to write: {}", e))?;

                            let _ = output_sender.send(ScheduledOutputEvent {
                                run_id: analyzed_run_id.to_string(),
                                agent_name: run_log.agent_name.clone(),
                                event_type: OutputEventType::Status,
                                content: format!(
                                    "Analyzer verdict: {} - {}",
                                    match verdict.verdict {
                                        AnalyzerVerdictType::Complete => "COMPLETE",
                                        AnalyzerVerdictType::Followup => "FOLLOWUP",
                                        AnalyzerVerdictType::Failed => "FAILED",
                                    },
                                    verdict.reason
                                ),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });

                            result = Some(VerdictProcessingResult {
                                verdict_type: verdict.verdict.clone(),
                                agent_name: run_log.agent_name.clone(),
                                worktree_path: run_log.worktree_path.clone(),
                                worktree_branch: run_log.worktree_branch.clone(),
                                base_commit: run_log.base_commit.clone(),
                            });
                            break;
                        }
                    }
                }
            }
        }
        if result.is_some() {
            break;
        }
    }

    result.ok_or_else(|| format!("Original run {} not found", analyzed_run_id))
}

/// Manually trigger the analyzer for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_analyzer_for_run(run_id: String, app: AppHandle) -> Result<String, String> {
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

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;
    let config = manager.get_agent(&run_log.agent_name).await?;
    drop(guard);

    if config.post_run_analyzer.is_none() {
        return Err(format!("Agent '{}' has no post-run analyzer configured", run_log.agent_name));
    }

    let mut env_vars = executor::ExtraEnvVars::new();
    env_vars.insert("ANALYZED_RUN_ID".to_string(), run_log.run_id.clone());
    env_vars.insert("ANALYZED_AGENT".to_string(), run_log.agent_name.clone());
    env_vars.insert("ANALYZED_LOG_FILE".to_string(), run_log.output_file.clone());
    env_vars.insert("ANALYZED_STATUS".to_string(), format!("{:?}", run_log.status).to_lowercase());

    if let Some(ref session_id) = run_log.claude_session_id {
        env_vars.insert("ANALYZED_SESSION_ID".to_string(), session_id.clone());
    }
    if let Some(ref wt_path) = run_log.worktree_path {
        env_vars.insert("ANALYZED_WORKTREE_PATH".to_string(), wt_path.clone());
    }
    if let Some(ref wt_branch) = run_log.worktree_branch {
        env_vars.insert("ANALYZED_WORKTREE_BRANCH".to_string(), wt_branch.clone());
    }
    if let Some(ref base_commit) = run_log.base_commit {
        env_vars.insert("ANALYZED_BASE_COMMIT".to_string(), base_commit.clone());
    }

    let trigger_info = executor::AnalyzerTriggerInfo {
        analyzer_agent: config.post_run_analyzer.as_ref().unwrap().analyzer_agent.clone(),
        env_vars,
    };

    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("scheduler:output", &event);
        }
    });

    let analyzer_name = trigger_info.analyzer_agent.clone();
    trigger_post_run_analyzer(trigger_info, output_sender, None).await;

    Ok(format!("Triggered analyzer '{}' for run {}", analyzer_name, run_id))
}
