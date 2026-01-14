use std::str::FromStr;
use std::collections::HashMap;
use tokio::sync::broadcast;
use cron::Schedule;
use tauri::{AppHandle, Emitter};

use super::types::*;
use super::executor;
use super::pipeline::PipelineManager;

/// Global cronos manager instance
pub static CRONOS: once_cell::sync::Lazy<tokio::sync::RwLock<Option<super::CronosManager>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::RwLock::new(None));

/// Global output broadcast channel for real-time streaming
static OUTPUT_SENDER: once_cell::sync::Lazy<broadcast::Sender<CronOutputEvent>> =
    once_cell::sync::Lazy::new(|| {
        let (tx, _) = broadcast::channel(1000);
        tx
    });

/// Global pipeline manager instance
static PIPELINE_MANAGER: once_cell::sync::Lazy<tokio::sync::RwLock<Option<PipelineManager>>> =
    once_cell::sync::Lazy::new(|| tokio::sync::RwLock::new(None));

/// Get or initialize the pipeline manager
async fn get_pipeline_manager() -> Result<std::sync::Arc<PipelineManager>, String> {
    let mut guard = PIPELINE_MANAGER.write().await;
    if guard.is_none() {
        let data_root = crate::utils::paths::get_nolan_data_root()?;
        *guard = Some(PipelineManager::new(&data_root));
    }
    // Clone the manager ref - we can't return a reference to the guard
    // So we wrap in Arc for the actual implementation
    Ok(std::sync::Arc::new(PipelineManager::new(&crate::utils::paths::get_nolan_data_root()?)))
}

/// Helper to get a fresh PipelineManager (since it's stateless, just needs the path)
fn get_pipeline_manager_sync() -> Result<PipelineManager, String> {
    let data_root = crate::utils::paths::get_nolan_data_root()?;
    Ok(PipelineManager::new(&data_root))
}

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

/// Trigger a post-run analyzer agent with the given context
/// This is called after an agent completes to analyze its output
async fn trigger_post_run_analyzer(
    trigger_info: executor::AnalyzerTriggerInfo,
    output_sender: broadcast::Sender<CronOutputEvent>,
    pipeline_id: Option<String>,
) {
    let analyzed_run_id = trigger_info.env_vars.get("ANALYZED_RUN_ID").cloned().unwrap_or_default();
    let analyzed_agent = trigger_info.env_vars.get("ANALYZED_AGENT").cloned().unwrap_or_default();

    // Emit status event about triggering analyzer
    let _ = output_sender.send(CronOutputEvent {
        run_id: analyzed_run_id.clone(),
        agent_name: analyzed_agent.clone(),
        event_type: OutputEventType::Status,
        content: format!("Triggering post-run analyzer: {}", trigger_info.analyzer_agent),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Update pipeline: analyzer stage starting
    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(pid, PipelineStageType::Analyzer, PipelineStageStatus::Running, None, None);
        }
    }

    // Load and execute the analyzer agent
    let guard = CRONOS.read().await;
    if let Some(manager) = guard.as_ref() {
        if let Ok(analyzer_config) = manager.get_agent(&trigger_info.analyzer_agent).await {
            drop(guard);  // Release lock before executing

            let guard = CRONOS.read().await;
            if let Some(manager) = guard.as_ref() {
                match executor::execute_cron_agent_with_env(
                    &analyzer_config,
                    manager,
                    RunTrigger::Manual,
                    false,
                    Some(output_sender.clone()),
                    None,
                    Some(trigger_info.env_vars),
                    None, // No label for analyzer runs
                ).await {
                    Ok(analyzer_run_log) => {
                        // After analyzer completes, read the verdict file and update original run
                        match process_analyzer_verdict(
                            &analyzed_run_id,
                            &analyzer_run_log.run_id,
                            &output_sender,
                        ).await {
                            Ok(verdict_result) => {
                                // Update pipeline: analyzer completed with verdict
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let verdict = AnalyzerVerdict {
                                            verdict: verdict_result.verdict_type.clone(),
                                            reason: "".to_string(), // Will be read from file
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
                                println!("[Cronos] Analyzer verdict: {:?}, worktree_path: {:?}, worktree_branch: {:?}",
                                    verdict_result.verdict_type,
                                    verdict_result.worktree_path,
                                    verdict_result.worktree_branch
                                );
                                if verdict_result.verdict_type == AnalyzerVerdictType::Complete {
                                    if let (Some(wt_path), Some(wt_branch)) =
                                        (verdict_result.worktree_path.clone(), verdict_result.worktree_branch.clone())
                                    {
                                        println!("[Cronos] Triggering QA then merge for {} on {}", wt_branch, wt_path);
                                        trigger_qa_then_merge(
                                            wt_path,
                                            wt_branch,
                                            verdict_result.base_commit,
                                            verdict_result.agent_name,
                                            output_sender,
                                            pipeline_id,
                                        ).await;
                                    } else {
                                        eprintln!("[Cronos] Skipping QA/merge: worktree info missing (path: {:?}, branch: {:?})",
                                            verdict_result.worktree_path, verdict_result.worktree_branch);
                                        // Mark pipeline as complete without QA/merge if no worktree
                                        if let Some(ref pid) = pipeline_id {
                                            if let Ok(pm) = get_pipeline_manager_sync() {
                                                let _ = pm.skip_stage(pid, PipelineStageType::Qa, "No worktree");
                                                let _ = pm.skip_stage(pid, PipelineStageType::Merger, "No worktree");
                                            }
                                        }
                                    }
                                } else if verdict_result.verdict_type == AnalyzerVerdictType::Failed {
                                    // Mark pipeline as failed
                                    if let Some(ref pid) = pipeline_id {
                                        if let Ok(pm) = get_pipeline_manager_sync() {
                                            let _ = pm.abort_pipeline(pid, "Analyzer verdict: FAILED");
                                        }
                                    }
                                } else {
                                    println!("[Cronos] Verdict is {:?}, not triggering QA/merge", verdict_result.verdict_type);
                                }
                            }
                            Err(e) => {
                                eprintln!("[Cronos] Failed to process analyzer verdict: {}", e);
                                // Update pipeline: analyzer failed
                                if let Some(ref pid) = pipeline_id {
                                    if let Ok(pm) = get_pipeline_manager_sync() {
                                        let _ = pm.update_stage(pid, PipelineStageType::Analyzer, PipelineStageStatus::Failed, None, None);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Cronos] Post-run analyzer {} failed: {}", trigger_info.analyzer_agent, e);
                        // Update pipeline: analyzer failed
                        if let Some(ref pid) = pipeline_id {
                            if let Ok(pm) = get_pipeline_manager_sync() {
                                let _ = pm.update_stage(pid, PipelineStageType::Analyzer, PipelineStageStatus::Failed, None, None);
                            }
                        }
                    }
                }
            }
        } else {
            eprintln!("[Cronos] Post-run analyzer {} not found", trigger_info.analyzer_agent);
        }
    } else {
        eprintln!("[Cronos] CRONOS not initialized for post-run analyzer");
    }
}

/// Result of processing an analyzer verdict, used to trigger follow-up actions
struct VerdictProcessingResult {
    verdict_type: AnalyzerVerdictType,
    agent_name: String,
    worktree_path: Option<String>,
    worktree_branch: Option<String>,
    base_commit: Option<String>,
}

/// Process the analyzer verdict file and update the original run's log
/// Returns verdict info for potential follow-up actions (e.g., triggering merger on COMPLETE)
async fn process_analyzer_verdict(
    analyzed_run_id: &str,
    analyzer_run_id: &str,
    output_sender: &broadcast::Sender<CronOutputEvent>,
) -> Result<VerdictProcessingResult, String> {
    let data_root = crate::utils::paths::get_nolan_data_root()?;
    let verdict_file = data_root
        .join(".state")
        .join("analyzer-verdicts")
        .join(format!("{}.json", analyzed_run_id));

    // Read and parse the verdict file
    let verdict_content = std::fs::read_to_string(&verdict_file)
        .map_err(|e| format!("Failed to read verdict file: {}", e))?;

    let mut verdict: AnalyzerVerdict = serde_json::from_str(&verdict_content)
        .map_err(|e| format!("Failed to parse verdict JSON: {}", e))?;

    // Add the analyzer run ID to the verdict
    verdict.analyzer_run_id = Some(analyzer_run_id.to_string());

    // Find and update the original run's JSON log
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut result: Option<VerdictProcessingResult> = None;

    // Search through date directories for the original run
    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if !date_entry.path().is_dir() {
            continue;
        }
        for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
            let path = file_entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(mut run_log) = serde_json::from_str::<CronRunLog>(&content) {
                        if run_log.run_id == analyzed_run_id {
                            // Update the run log with the verdict
                            run_log.analyzer_verdict = Some(verdict.clone());

                            // Write back the updated log
                            let updated_json = serde_json::to_string_pretty(&run_log)
                                .map_err(|e| format!("Failed to serialize updated run log: {}", e))?;
                            std::fs::write(&path, updated_json)
                                .map_err(|e| format!("Failed to write updated run log: {}", e))?;

                            // Emit status event about verdict
                            let _ = output_sender.send(CronOutputEvent {
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

                            // Capture result for follow-up actions
                            println!("[Cronos] process_analyzer_verdict found run {}: worktree_path={:?}, worktree_branch={:?}",
                                analyzed_run_id, run_log.worktree_path, run_log.worktree_branch);
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

/// Trigger QA validation, then merger if QA passes
async fn trigger_qa_then_merge(
    worktree_path: String,
    worktree_branch: String,
    base_commit: Option<String>,
    agent_name: String,
    output_sender: broadcast::Sender<CronOutputEvent>,
    pipeline_id: Option<String>,
) {
    println!("[Cronos] trigger_qa_then_merge called: path={}, branch={}", worktree_path, worktree_branch);

    // Emit status event about triggering QA
    let _ = output_sender.send(CronOutputEvent {
        run_id: String::new(),
        agent_name: agent_name.clone(),
        event_type: OutputEventType::Status,
        content: format!("Triggering QA validation for branch: {}", worktree_branch),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Update pipeline: QA stage starting
    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(pid, PipelineStageType::Qa, PipelineStageStatus::Running, None, None);
        }
    }

    // Build environment variables for QA validation
    let mut qa_env = executor::ExtraEnvVars::new();
    qa_env.insert("WORKTREE_PATH".to_string(), worktree_path.clone());
    qa_env.insert("WORKTREE_BRANCH".to_string(), worktree_branch.clone());
    if let Some(ref commit) = base_commit {
        qa_env.insert("BASE_COMMIT".to_string(), commit.clone());
    }
    if let Some(ref pid) = pipeline_id {
        qa_env.insert("PIPELINE_ID".to_string(), pid.clone());
    }

    // Load and execute QA validation
    let guard = CRONOS.read().await;
    if let Some(manager) = guard.as_ref() {
        match manager.get_agent("pred-qa-validation").await {
            Ok(qa_config) => {
                println!("[Cronos] Found pred-qa-validation agent, executing...");
                drop(guard); // Release lock before executing

                let guard = CRONOS.read().await;
                if let Some(manager) = guard.as_ref() {
                    match executor::execute_cron_agent_with_env(
                        &qa_config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender.clone()),
                        None,
                        Some(qa_env),
                        None, // No label for QA validation runs
                    ).await {
                        Ok(qa_run_log) => {
                            let _ = output_sender.send(CronOutputEvent {
                                run_id: qa_run_log.run_id.clone(),
                                agent_name: "pred-qa-validation".to_string(),
                                event_type: OutputEventType::Complete,
                                content: format!("QA validation completed with status: {:?}", qa_run_log.status),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });

                            // Only proceed to merge if QA passed
                            if qa_run_log.status == CronRunStatus::Success {
                                // Update pipeline: QA succeeded
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
                                ).await;
                            } else {
                                // Update pipeline: QA failed (blocked, awaiting retry/skip)
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

                                let _ = output_sender.send(CronOutputEvent {
                                    run_id: qa_run_log.run_id,
                                    agent_name: agent_name,
                                    event_type: OutputEventType::Status,
                                    content: "Skipping merge: QA validation did not pass".to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                });
                            }
                        }
                        Err(e) => {
                            eprintln!("[Cronos] QA validation failed: {}", e);
                            // Update pipeline: QA failed
                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let _ = pm.update_stage(pid, PipelineStageType::Qa, PipelineStageStatus::Failed, None, None);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[Cronos] pred-qa-validation agent not found: {}", e);
            }
        }
    }
}

/// Trigger the worktree merger agent
async fn trigger_worktree_merger(
    worktree_path: String,
    worktree_branch: String,
    output_sender: broadcast::Sender<CronOutputEvent>,
    pipeline_id: Option<String>,
) {
    println!("[Cronos] trigger_worktree_merger called: path={}, branch={}", worktree_path, worktree_branch);

    // Emit status event about triggering merger
    let _ = output_sender.send(CronOutputEvent {
        run_id: String::new(),
        agent_name: "pred-merge-changes".to_string(),
        event_type: OutputEventType::Status,
        content: format!("Triggering worktree merger for branch: {}", worktree_branch),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Update pipeline: merger stage starting
    if let Some(ref pid) = pipeline_id {
        if let Ok(pm) = get_pipeline_manager_sync() {
            let _ = pm.update_stage(pid, PipelineStageType::Merger, PipelineStageStatus::Running, None, None);
        }
    }

    // Get the nolan root for REPO_PATH
    let repo_path = match crate::utils::paths::get_nolan_root() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(e) => {
            eprintln!("[Cronos] Failed to get nolan root for merger: {}", e);
            return;
        }
    };

    // Build environment variables for the merger
    let mut extra_env = executor::ExtraEnvVars::new();
    extra_env.insert("WORKTREE_PATH".to_string(), worktree_path);
    extra_env.insert("WORKTREE_BRANCH".to_string(), worktree_branch);
    extra_env.insert("BASE_BRANCH".to_string(), "main".to_string());
    extra_env.insert("REPO_PATH".to_string(), repo_path);
    if let Some(ref pid) = pipeline_id {
        extra_env.insert("PIPELINE_ID".to_string(), pid.clone());
    }

    // Load and execute the merger agent
    let guard = CRONOS.read().await;
    if let Some(manager) = guard.as_ref() {
        match manager.get_agent("pred-merge-changes").await {
            Ok(merger_config) => {
                drop(guard); // Release lock before executing

                let guard = CRONOS.read().await;
                if let Some(manager) = guard.as_ref() {
                    match executor::execute_cron_agent_with_env(
                        &merger_config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender.clone()),
                        None,
                        Some(extra_env),
                        None, // No label for merge runs
                    ).await {
                        Ok(merger_run_log) => {
                            let _ = output_sender.send(CronOutputEvent {
                                run_id: merger_run_log.run_id.clone(),
                                agent_name: "pred-merge-changes".to_string(),
                                event_type: OutputEventType::Complete,
                                content: format!("Worktree merger completed with status: {:?}", merger_run_log.status),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });

                            // Update pipeline: merger completed
                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let stage_status = match merger_run_log.status {
                                        CronRunStatus::Success => PipelineStageStatus::Success,
                                        _ => PipelineStageStatus::Failed,
                                    };
                                    let _ = pm.update_stage(
                                        pid,
                                        PipelineStageType::Merger,
                                        stage_status,
                                        Some(&merger_run_log.run_id),
                                        None,
                                    );

                                    // Log final pipeline status
                                    if let Ok(pipeline) = pm.get_pipeline(pid) {
                                        println!("[Pipeline] Pipeline {} completed with status: {:?}", pid, pipeline.status);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[Cronos] Worktree merger failed: {}", e);
                            // Update pipeline: merger failed
                            if let Some(ref pid) = pipeline_id {
                                if let Ok(pm) = get_pipeline_manager_sync() {
                                    let _ = pm.update_stage(pid, PipelineStageType::Merger, PipelineStageStatus::Failed, None, None);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[Cronos] pred-merge-changes agent not found: {}", e);
            }
        }
    }
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

        // Handle schedule based on agent type (only Cron type has schedule)
        let (schedule_str, cron_expr, next_run) = match &config.schedule {
            Some(sched) => (
                describe_cron(&sched.cron),
                sched.cron.clone(),
                calculate_next_run(&sched.cron),
            ),
            None => (
                String::new(),
                String::new(),
                None,
            ),
        };

        infos.push(CronAgentInfo {
            name: config.name.clone(),
            description: config.description.clone(),
            model: config.model.clone(),
            enabled: config.enabled,
            agent_type: config.agent_type.clone(),
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
pub async fn get_cron_agent(name: String) -> Result<CronAgentConfig, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_agent(&name).await
}

#[tauri::command]
pub async fn create_cron_agent(config: CronAgentConfig) -> Result<(), String> {
    // Validate name format based on agent type
    if !config.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Agent name must contain only lowercase letters, digits, and hyphens".to_string());
    }

    // Validate based on agent type
    match config.agent_type {
        AgentType::Cron => {
            if !config.name.starts_with("cron-") {
                return Err("Cron agent name must start with 'cron-'".to_string());
            }
            if config.schedule.is_none() {
                return Err("Cron agents require a schedule".to_string());
            }
            validate_cron(&config.schedule.as_ref().unwrap().cron)?;
        }
        AgentType::Predefined => {
            if !config.name.starts_with("pred-") {
                return Err("Predefined agent name must start with 'pred-'".to_string());
            }
        }
        AgentType::Event => {
            if !config.name.starts_with("event-") {
                return Err("Event agent name must start with 'event-'".to_string());
            }
            if config.event_trigger.is_none() {
                return Err("Event agents require an event_trigger".to_string());
            }
        }
        AgentType::Team => {
            if !config.name.starts_with("team-") {
                return Err("Team agent name must start with 'team-'".to_string());
            }
        }
    }

    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.save_agent(&config).await?;

    // Determine the correct agents directory based on type
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let agents_dir = match config.agent_type {
        AgentType::Cron => nolan_root.join("cronos/agents"),
        AgentType::Predefined => nolan_root.join("predefined/agents"),
        AgentType::Event => nolan_root.join("event/agents"),
        AgentType::Team => crate::utils::paths::get_agents_dir()?,
    };

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
pub async fn update_cron_agent(name: String, config: CronAgentConfig) -> Result<(), String> {
    if config.name != name {
        return Err("Cannot change agent name".to_string());
    }

    // Only validate cron expression for Cron type agents
    if config.agent_type == AgentType::Cron {
        if let Some(ref sched) = config.schedule {
            validate_cron(&sched.cron)?;
        } else {
            return Err("Cron agents require a schedule".to_string());
        }
    }

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

#[tauri::command(rename_all = "snake_case")]
pub async fn get_cron_group(group_id: String) -> Result<CronAgentGroup, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_group(&group_id)
}

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_cron_group(group_id: String) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.delete_group(&group_id)
}

#[tauri::command(rename_all = "snake_case")]
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
            match executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender.clone()),
                None,
            ).await {
                Ok(run_log) => {
                    // Check if post-run analyzer should be triggered
                    if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                        trigger_post_run_analyzer(trigger_info, output_sender, None).await;
                    }
                }
                Err(e) => eprintln!("Cron agent {} failed: {}", agent_name, e),
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
            match executor::execute_cron_agent(
                &config,
                manager,
                RunTrigger::Manual,
                false,
                Some(output_sender.clone()),
                None,
            ).await {
                Ok(run_log) => {
                    // Check if post-run analyzer should be triggered
                    if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                        trigger_post_run_analyzer(trigger_info, output_sender, None).await;
                    }
                }
                Err(e) => eprintln!("Cron agent {} failed: {}", agent_name, e),
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
        let run_log = executor::execute_cron_agent(
            &config,
            manager,
            RunTrigger::Scheduled,
            false,
            Some(output_sender.clone()),
            None,
        ).await?;

        // Check if post-run analyzer should be triggered
        if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
            trigger_post_run_analyzer(trigger_info, output_sender, None).await;
        }
    }

    Ok(format!("Scheduled run completed for {}", name))
}

#[tauri::command]
pub async fn cancel_cron_agent(name: String) -> Result<(), String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    executor::cancel_cron_agent(manager, &name).await
}

// ========================
// Session Relaunch
// ========================

/// Relaunch a cron agent session using Claude's --resume flag
/// This allows continuing a previous session to complete tasks or answer questions
#[tauri::command(rename_all = "snake_case")]
pub async fn relaunch_cron_session(
    run_id: String,
    follow_up_prompt: String,
    app: AppHandle,
) -> Result<String, String> {
    relaunch_cron_session_impl(run_id, follow_up_prompt, Some(app)).await
}

/// Relaunch via HTTP API (no AppHandle)
pub async fn relaunch_cron_session_api(
    run_id: String,
    follow_up_prompt: String,
) -> Result<String, String> {
    relaunch_cron_session_impl(run_id, follow_up_prompt, None).await
}

/// Implementation of session relaunch
async fn relaunch_cron_session_impl(
    run_id: String,
    follow_up_prompt: String,
    app: Option<AppHandle>,
) -> Result<String, String> {
    // Find the original run log
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut original_run: Option<CronRunLog> = None;

    // Search through date directories for the run
    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                original_run = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if original_run.is_some() { break; }
    }

    let original = original_run.ok_or_else(|| format!("Run {} not found", run_id))?;

    // Verify we have a claude_session_id
    let claude_session_id = original.claude_session_id
        .ok_or_else(|| "Original run has no claude_session_id (older run before this feature)".to_string())?;

    // Get agent config
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&original.agent_name).await?;

    // Check if agent is already running
    if !config.concurrency.allow_parallel && manager.is_running(&original.agent_name).await {
        return Err(format!("Agent '{}' is already running", original.agent_name));
    }
    drop(guard);

    // Generate new run ID for the relaunch (includes timestamp for human-readable identification)
    let started_at = chrono::Utc::now();
    let timestamp = started_at.format("%H%M%S").to_string();
    let date_str = started_at.format("%Y-%m-%d").to_string();
    let uuid_suffix = uuid::Uuid::new_v4().to_string()[..7].to_string();
    let new_run_id = format!("{}-{}", timestamp, uuid_suffix);

    // Setup paths
    let nolan_root = crate::utils::paths::get_nolan_root()?;
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?.join(&date_str);
    std::fs::create_dir_all(&runs_dir)
        .map_err(|e| format!("Failed to create runs directory: {}", e))?;

    let log_file = runs_dir.join(format!("{}-{}-resume.log", original.agent_name, &new_run_id));
    let json_file = runs_dir.join(format!("{}-{}-resume.json", original.agent_name, &new_run_id));

    // Create run directory
    let run_dir = runs_dir.join(format!("{}-{}-resume", original.agent_name, new_run_id));
    std::fs::create_dir_all(&run_dir)
        .map_err(|e| format!("Failed to create run directory: {}", e))?;

    // Symlink .claude to app root
    #[cfg(unix)]
    {
        let claude_link = run_dir.join(".claude");
        if !claude_link.exists() {
            let _ = std::os::unix::fs::symlink(nolan_root.join(".claude"), &claude_link);
        }
    }

    // Generate tmux session name (distinguishes as a resume)
    let session_name = format!("cron-{}-{}-resume", original.agent_name, &new_run_id);

    // Escape the follow-up prompt for shell
    let prompt_escaped = follow_up_prompt.replace("'", "'\\''");

    // Build environment exports
    let nolan_data_root = crate::utils::paths::get_nolan_data_root()?;
    let env_exports = format!(
        "export CRON_RUN_ID='{}' CRON_AGENT='{}' CRON_ORIGINAL_RUN='{}' NOLAN_ROOT='{}' NOLAN_DATA_ROOT='{}'",
        new_run_id, original.agent_name, run_id, nolan_root.to_string_lossy(), nolan_data_root.to_string_lossy()
    );

    // Determine working directory - use worktree_path only if agent has worktree enabled,
    // otherwise use agent's configured working_directory or nolan_root (where the session was created)
    let work_dir = if config.worktree.as_ref().map(|wt| wt.enabled).unwrap_or(false) {
        // Agent uses worktree, prefer worktree_path from original run
        original.worktree_path
            .as_ref()
            .filter(|d| std::path::Path::new(d).exists())
            .map(std::path::PathBuf::from)
            .or_else(|| config.context.working_directory.as_ref().map(std::path::PathBuf::from))
            .unwrap_or_else(|| nolan_root.clone())
    } else {
        // Agent doesn't use worktree, use agent's working_directory or nolan_root
        config.context.working_directory
            .as_ref()
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| nolan_root.clone())
    };

    // Build claude command with --resume flag
    let claude_cmd = format!(
        "claude --resume '{}' -p '{}' --dangerously-skip-permissions --verbose --output-format stream-json --model {}",
        claude_session_id, prompt_escaped, config.model
    );

    // Build full shell command
    let exit_code_file = run_dir.join("exit_code");
    let shell_cmd = format!(
        "{}; cd '{}'; {} 2>&1 | tee '{}'; echo ${{PIPESTATUS[0]}} > '{}'",
        env_exports,
        work_dir.to_string_lossy(),
        claude_cmd,
        log_file.to_string_lossy(),
        exit_code_file.to_string_lossy()
    );

    // Write initial run log
    let initial_log = CronRunLog {
        run_id: new_run_id.clone(),
        agent_name: original.agent_name.clone(),
        started_at: started_at.to_rfc3339(),
        completed_at: None,
        status: CronRunStatus::Running,
        duration_secs: None,
        exit_code: None,
        output_file: log_file.to_string_lossy().to_string(),
        error: None,
        attempt: 1,
        trigger: RunTrigger::Manual,
        session_name: Some(session_name.clone()),
        run_dir: Some(run_dir.to_string_lossy().to_string()),
        claude_session_id: Some(claude_session_id.clone()),  // Reuse original session ID
        total_cost_usd: None,
        worktree_path: original.worktree_path.clone(),  // Inherit worktree if any
        worktree_branch: original.worktree_branch.clone(),
        base_commit: original.base_commit.clone(),
        analyzer_verdict: None,  // Relaunched runs start fresh without verdict
        pipeline_id: original.pipeline_id.clone(),  // Inherit pipeline ID if any
        label: original.label.clone(),  // Inherit label from original run
        parent_run_id: None,
    };

    let json = serde_json::to_string_pretty(&initial_log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&json_file, &json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    // Create tmux session
    let output = std::process::Command::new("tmux")
        .args(&[
            "new-session", "-d", "-s", &session_name,
            "-c", &run_dir.to_string_lossy(),
            "bash", "-c", &shell_cmd
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

    // Register session
    if let Err(e) = crate::commands::lifecycle::register_session(
        &session_name,
        &original.agent_name,
        &run_dir.to_string_lossy(),
        "",
    ) {
        eprintln!("Warning: Failed to register cron session: {}", e);
    }

    // Get output sender and setup frontend forwarding if we have AppHandle
    let output_sender = OUTPUT_SENDER.clone();
    if let Some(app) = app {
        let mut receiver = output_sender.subscribe();
        tokio::spawn(async move {
            while let Ok(event) = receiver.recv().await {
                let _ = app.emit("cronos:output", &event);
            }
        });
    }

    // Emit start event
    let _ = output_sender.send(CronOutputEvent {
        run_id: new_run_id.clone(),
        agent_name: original.agent_name.clone(),
        event_type: OutputEventType::Status,
        content: format!("Relaunching session {} (original run: {})", claude_session_id, run_id),
        timestamp: started_at.to_rfc3339(),
    });

    // Spawn a task to monitor completion and update the log
    let agent_name = original.agent_name.clone();
    let config_timeout = config.timeout;
    let config_for_analyzer = config.clone();  // Clone config for analyzer trigger
    let original_worktree_path = original.worktree_path.clone();
    let original_worktree_branch = original.worktree_branch.clone();
    let original_base_commit = original.base_commit.clone();
    let original_label = original.label.clone();
    let result_run_id = new_run_id.clone();  // Clone before move into async block
    tokio::spawn(async move {
        let timeout_duration = std::time::Duration::from_secs(config_timeout as u64);
        let start = std::time::Instant::now();
        let check_interval = std::time::Duration::from_secs(2);

        loop {
            // Check exit code file
            if exit_code_file.exists() {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                break;
            }

            // Check if session exists
            if let Ok(output) = std::process::Command::new("tmux")
                .args(&["has-session", "-t", &session_name])
                .output()
            {
                if !output.status.success() {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    break;
                }
            }

            // Check timeout
            if start.elapsed() > timeout_duration {
                // Kill session on timeout
                let _ = std::process::Command::new("tmux")
                    .args(&["kill-session", "-t", &session_name])
                    .output();
                break;
            }

            tokio::time::sleep(check_interval).await;
        }

        // Determine final status
        let completed_at = chrono::Utc::now();
        let duration = (completed_at - started_at).num_seconds() as u32;

        let exit_code = std::fs::read_to_string(&exit_code_file)
            .ok()
            .and_then(|s| s.trim().parse::<i32>().ok());

        let (status, error) = if start.elapsed() > timeout_duration {
            (CronRunStatus::Timeout, Some(format!("Timeout after {}s", config_timeout)))
        } else if exit_code == Some(0) {
            (CronRunStatus::Success, None)
        } else {
            (CronRunStatus::Failed, Some("Non-zero exit code".to_string()))
        };

        // Extract cost from log
        let total_cost_usd = executor::extract_cost_from_log_file(&log_file.to_string_lossy());

        // Update the JSON log
        let final_log = CronRunLog {
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

        // Emit completion event
        let _ = output_sender.send(CronOutputEvent {
            run_id: new_run_id,
            agent_name: agent_name.clone(),
            event_type: OutputEventType::Complete,
            content: format!("Relaunch completed with status: {:?}", status),
            timestamp: completed_at.to_rfc3339(),
        });

        // Trigger post-run analyzer if configured
        if let Some(trigger_info) = executor::get_analyzer_trigger_info(&config_for_analyzer, &final_log) {
            trigger_post_run_analyzer(trigger_info, output_sender, None).await;
        }

        // Cleanup run directory on success
        if status == CronRunStatus::Success {
            let _ = std::fs::remove_dir_all(&run_dir);
        }
    });

    Ok(format!("Relaunched session for run {} as new run {}", run_id, result_run_id))
}

/// Manually trigger the analyzer for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_analyzer_for_run(
    run_id: String,
    app: AppHandle,
) -> Result<String, String> {
    // Find the run log
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut run_log: Option<CronRunLog> = None;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                run_log = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() { break; }
    }

    let run_log = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    // Get the agent config
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&run_log.agent_name).await?;
    drop(guard);

    // Check if analyzer is configured
    if config.post_run_analyzer.is_none() {
        return Err(format!("Agent '{}' has no post-run analyzer configured", run_log.agent_name));
    }

    // Build trigger info (bypass status check for manual trigger)
    let mut env_vars = executor::ExtraEnvVars::new();
    env_vars.insert("ANALYZED_RUN_ID".to_string(), run_log.run_id.clone());
    env_vars.insert("ANALYZED_AGENT".to_string(), run_log.agent_name.clone());
    env_vars.insert("ANALYZED_LOG_FILE".to_string(), run_log.output_file.clone());
    env_vars.insert("ANALYZED_STATUS".to_string(), format!("{:?}", run_log.status).to_lowercase());
    if let Some(ref session_id) = run_log.claude_session_id {
        env_vars.insert("ANALYZED_SESSION_ID".to_string(), session_id.clone());
    }
    // Pass worktree info from parent run so analyzer run can trigger QA
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

    // Setup output sender and app forwarding
    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("cronos:output", &event);
        }
    });

    // Trigger the analyzer
    let analyzer_name = trigger_info.analyzer_agent.clone();
    trigger_post_run_analyzer(trigger_info, output_sender, None).await;

    Ok(format!("Triggered analyzer '{}' for run {}", analyzer_name, run_id))
}

/// Manually trigger QA validation for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_qa_for_run(
    run_id: String,
    app: AppHandle,
) -> Result<String, String> {
    // Find the run log
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut run_log: Option<CronRunLog> = None;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                run_log = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() { break; }
    }

    let run_log = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    // Check we have worktree info
    let worktree_path = run_log.worktree_path
        .ok_or_else(|| "Run has no worktree path - QA requires a worktree".to_string())?;
    let worktree_branch = run_log.worktree_branch
        .ok_or_else(|| "Run has no worktree branch - QA requires a branch".to_string())?;

    // Setup output sender and app forwarding
    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("cronos:output", &event);
        }
    });

    // Trigger QA then merge
    trigger_qa_then_merge(
        worktree_path.clone(),
        worktree_branch.clone(),
        run_log.base_commit,
        run_log.agent_name,
        output_sender,
        None, // No pipeline context for manual trigger
    ).await;

    Ok(format!("Triggered QA validation for branch {}", worktree_branch))
}

/// Manually trigger worktree merge for a specific run
#[tauri::command(rename_all = "snake_case")]
pub async fn trigger_merge_for_run(
    run_id: String,
    app: AppHandle,
) -> Result<String, String> {
    // Find the run log
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut run_log: Option<CronRunLog> = None;

    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                run_log = Some(log);
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() { break; }
    }

    let run_log = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    // Check we have worktree info
    let worktree_path = run_log.worktree_path
        .ok_or_else(|| "Run has no worktree path - merge requires a worktree".to_string())?;
    let worktree_branch = run_log.worktree_branch
        .ok_or_else(|| "Run has no worktree branch - merge requires a branch".to_string())?;

    // Setup output sender and app forwarding
    let output_sender = OUTPUT_SENDER.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app.emit("cronos:output", &event);
        }
    });

    // Trigger merge directly (skip QA)
    trigger_worktree_merger(
        worktree_path.clone(),
        worktree_branch.clone(),
        output_sender,
        None, // No pipeline context for manual trigger
    ).await;

    Ok(format!("Triggered merge for branch {}", worktree_branch))
}

// ========================
// Predefined Agent Commands
// ========================

/// Trigger a predefined agent (manual trigger)
#[tauri::command]
pub async fn trigger_predefined_agent(name: String, app: AppHandle) -> Result<String, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    let config = manager.get_agent(&name).await?;

    // Verify it's a predefined agent
    if config.agent_type != AgentType::Predefined {
        return Err(format!("Agent '{}' is not a predefined agent", name));
    }

    // Check if already running (unless parallel allowed)
    if !config.concurrency.allow_parallel && manager.is_running(&name).await {
        return Err(format!("Agent '{}' is already running", name));
    }

    drop(guard);

    // Reuse existing trigger logic
    trigger_cron_agent(name, app).await
}

/// List all available slash commands from predefined agents
#[tauri::command]
pub async fn list_agent_commands() -> Result<Vec<AgentCommand>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let agents = manager.load_agents().await?;
    let commands: Vec<AgentCommand> = agents.iter()
        .filter(|a| a.agent_type == AgentType::Predefined)
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

/// Agent slash command info for UI integration
#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/types/generated/cronos/")]
pub struct AgentCommand {
    pub command: String,
    pub agent_name: String,
    pub description: String,
    pub icon: Option<String>,
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

#[tauri::command(rename_all = "snake_case")]
pub async fn get_cron_run_history(
    agent_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<CronRunLog>, String> {
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;
    manager.get_run_history(agent_name.as_deref(), limit.unwrap_or(50)).await
}

#[tauri::command(rename_all = "snake_case")]
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
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;

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
    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let path = agents_dir.join(&name).join("CLAUDE.md");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

#[tauri::command]
pub async fn write_cron_agent_claude_md(name: String, content: String) -> Result<(), String> {
    let agents_dir = crate::utils::paths::get_agents_dir()?;
    let path = agents_dir.join(&name).join("CLAUDE.md");
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

    // Calculate success rates and costs
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

    // Calculate total cost for last 7 days - try JSON field first, then extract from output log
    let total_cost_7d: f32 = runs_7d.iter()
        .filter_map(|r| {
            // First try the JSON field
            if let Some(cost) = r.total_cost_usd {
                return Some(cost);
            }
            // Fall back to extracting from output log file
            if !r.output_file.is_empty() {
                return executor::extract_cost_from_log_file(&r.output_file);
            }
            None
        })
        .sum();

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
        total_cost_7d,
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
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

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
        // Use idea title as label for meaningful worktree names
        let label = Some(idea.title.clone());

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
                    label,
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
#[tauri::command(rename_all = "snake_case")]
pub async fn dispatch_single_idea(idea_id: String, app: AppHandle) -> Result<String, String> {
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

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
    // Use idea title as label for meaningful worktree names
    let label = Some(idea.title.clone());
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
                label,
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
    #[serde(rename = "review_status")]
    _review_status: String,
    #[serde(default)]
    complexity: Option<String>,
    proposal: Option<ProposalForRouting>,
    #[serde(default)]
    gaps: Vec<GapForRouting>,
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

#[derive(Clone, Debug, serde::Deserialize)]
struct GapForRouting {
    label: String,
    description: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    required: bool,
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
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

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

            // Generate pipeline ID upfront
            let pipeline_id = format!("pipeline-{}", idea_id);

            let mut extra_env = executor::ExtraEnvVars::new();
            extra_env.insert("IDEA_ID".to_string(), idea_id.clone());
            extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());
            extra_env.insert("PIPELINE_ID".to_string(), pipeline_id.clone());
            // Use idea title as label for meaningful worktree names
            let label = Some(idea.title.clone());

            // Clone values for the async block
            let idea_id_clone = idea_id.clone();
            let idea_title_clone = idea.title.clone();
            let extra_env_clone = extra_env.clone();

            // Spawn in background
            tokio::spawn(async move {
                let guard = CRONOS.read().await;
                if let Some(manager) = guard.as_ref() {
                    match executor::execute_cron_agent_with_env(
                        &config,
                        manager,
                        RunTrigger::Manual,
                        false,
                        Some(output_sender.clone()),
                        None,
                        Some(extra_env),
                        label,
                    ).await {
                        Ok(run_log) => {
                            // Create pipeline now that we have worktree info from run_log
                            if let Ok(pm) = get_pipeline_manager_sync() {
                                match pm.create_pipeline(
                                    &pipeline_id,
                                    &idea_id_clone,
                                    &idea_title_clone,
                                    &run_log.run_id,
                                    run_log.worktree_path.as_deref(),
                                    run_log.worktree_branch.as_deref(),
                                    run_log.base_commit.as_deref(),
                                    extra_env_clone.into_iter().collect(),
                                ) {
                                    Ok(pipeline) => {
                                        println!("[Pipeline] Created pipeline {} for idea {}", pipeline.id, idea_id_clone);
                                        // Update implementer stage to success/failed based on run status
                                        let stage_status = match run_log.status {
                                            CronRunStatus::Success => PipelineStageStatus::Success,
                                            CronRunStatus::Failed | CronRunStatus::Timeout => PipelineStageStatus::Failed,
                                            _ => PipelineStageStatus::Success, // Treat others as success for analyzer to evaluate
                                        };
                                        let _ = pm.update_stage(
                                            &pipeline_id,
                                            PipelineStageType::Implementer,
                                            stage_status,
                                            Some(&run_log.run_id),
                                            None,
                                        );
                                    }
                                    Err(e) => eprintln!("[Pipeline] Failed to create pipeline: {}", e),
                                }
                            }

                            // Check if post-run analyzer should be triggered
                            if let Some(mut trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                                // Add pipeline_id to analyzer env vars
                                trigger_info.env_vars.insert("PIPELINE_ID".to_string(), pipeline_id.clone());
                                trigger_post_run_analyzer(trigger_info, output_sender, Some(pipeline_id)).await;
                            }
                        }
                        Err(e) => eprintln!("Idea implementer failed: {}", e),
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
            // High complexity → Create project (or use existing)
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

            // Check if project already exists
            let projects_dir = crate::utils::paths::get_projects_dir()?;
            let existing_project_path = projects_dir.join(&project_name);
            let project_exists = existing_project_path.exists();

            // Create project only if it doesn't exist
            let project_path = if project_exists {
                eprintln!("Project '{}' already exists, launching team for existing project", project_name);
                existing_project_path.to_string_lossy().to_string()
            } else {
                crate::commands::projects::create_project(
                    project_name.clone(),
                    None, // Use default team
                ).await?
            };

            // Only write SPEC.md for new projects
            if !project_exists {
                // Build Requirements section from gaps
                let qa_section = {
                    let answered_gaps: Vec<_> = review.gaps.iter()
                        .filter(|g| g.value.is_some())
                        .collect();
                    let unanswered_required: Vec<_> = review.gaps.iter()
                        .filter(|g| g.value.is_none() && g.required)
                        .collect();

                    if answered_gaps.is_empty() && unanswered_required.is_empty() {
                        String::new()
                    } else {
                        let mut qa = String::from("\n## Requirements\n\n");

                        // Add answered questions with descriptions
                        for gap in answered_gaps {
                            if let Some(value) = &gap.value {
                                qa.push_str(&format!("**{}**: {}\n", gap.label, value));
                                qa.push_str(&format!("*{}*\n\n", gap.description));
                            }
                        }

                        // Add unanswered required questions as TODOs
                        if !unanswered_required.is_empty() {
                            qa.push_str("### TODO: Unanswered Required Questions\n\n");
                            for gap in unanswered_required {
                                qa.push_str(&format!("- [ ] **{}**: {}\n", gap.label, gap.description));
                            }
                            qa.push('\n');
                        }

                        qa
                    }
                };

                // Write spec file with proposal content
                let spec_content = format!(
r#"# {}

## Summary

{}

## Problem

{}

## Solution

{}
{}{}{}
---
*Generated from accepted idea: {}*
"#,
                    proposal.title,
                    proposal.summary,
                    proposal.problem,
                    proposal.solution,
                    proposal.scope.as_ref().map(|s| format!("\n## Scope\n\n{}\n", s)).unwrap_or_default(),
                    proposal.implementation_hints.as_ref().map(|h| format!("\n## Implementation Hints\n\n{}\n", h)).unwrap_or_default(),
                    qa_section,
                    idea_id
                );

                let spec_path = std::path::Path::new(&project_path).join("SPEC.md");
                std::fs::write(&spec_path, spec_content)
                    .map_err(|e| format!("Failed to write SPEC.md: {}", e))?;
            }

            // Return project info - frontend will show team selection modal
            // User selects team, then frontend calls launch_team with proper project context
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
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

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
        // Use idea title as label for meaningful worktree names
        let label = Some(idea.title.clone());

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
                    label,
                ).await {
                    eprintln!("Idea processor failed: {}", e);
                }
            }
        });

        result.dispatched.push(idea.id);
    }

    Ok(result)
}

// ========================
// Pipeline Stage Actions
// ========================

/// Skip a pipeline stage by marking its run as skipped
/// This allows advancing the pipeline without completing the stage
#[tauri::command(rename_all = "snake_case")]
pub async fn skip_pipeline_stage(
    run_id: String,
    reason: Option<String>,
) -> Result<CronRunLog, String> {
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut run_log: Option<(CronRunLog, std::path::PathBuf)> = None;

    // Search through date directories for the run
    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                            if log.run_id == run_id {
                                run_log = Some((log, path));
                                break;
                            }
                        }
                    }
                }
            }
        }
        if run_log.is_some() { break; }
    }

    let (mut log, path) = run_log.ok_or_else(|| format!("Run {} not found", run_id))?;

    // Don't skip if already running
    if log.status == CronRunStatus::Running {
        return Err("Cannot skip a running stage".to_string());
    }

    // Don't skip if already succeeded
    if log.status == CronRunStatus::Success {
        return Err("Cannot skip an already successful stage".to_string());
    }

    // Update status to Skipped
    log.status = CronRunStatus::Skipped;
    log.error = reason.or(Some("Manually skipped".to_string()));
    if log.completed_at.is_none() {
        log.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    // Write updated log
    let updated_json = serde_json::to_string_pretty(&log)
        .map_err(|e| format!("Failed to serialize run log: {}", e))?;
    std::fs::write(&path, updated_json)
        .map_err(|e| format!("Failed to write run log: {}", e))?;

    // Emit status event
    let _ = OUTPUT_SENDER.send(CronOutputEvent {
        run_id: log.run_id.clone(),
        agent_name: log.agent_name.clone(),
        event_type: OutputEventType::Status,
        content: "Stage manually skipped".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok(log)
}

/// Abort an entire pipeline by cancelling running stages and marking all as cancelled
#[tauri::command(rename_all = "snake_case")]
pub async fn abort_pipeline(
    pipeline_id: String,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    let runs_dir = crate::utils::paths::get_cronos_runs_dir()?;
    let mut cancelled_runs: Vec<String> = Vec::new();
    let mut cancelled_agents: Vec<String> = Vec::new();

    // Get CRONOS manager for cancellation
    let guard = CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    // Search through date directories for runs matching the pipeline
    // Pipeline ID is typically the worktree branch pattern
    for date_entry in std::fs::read_dir(&runs_dir).into_iter().flatten().flatten() {
        if date_entry.path().is_dir() {
            for file_entry in std::fs::read_dir(date_entry.path()).into_iter().flatten().flatten() {
                let path = file_entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(mut log) = serde_json::from_str::<CronRunLog>(&content) {
                            // Match by worktree_branch or run_id pattern
                            let matches = log.worktree_branch.as_ref()
                                .map(|b| b.contains(&pipeline_id))
                                .unwrap_or(false)
                                || log.run_id.contains(&pipeline_id);

                            if matches {
                                // If running, cancel the agent
                                if log.status == CronRunStatus::Running {
                                    if let Err(e) = executor::cancel_cron_agent(manager, &log.agent_name).await {
                                        eprintln!("Failed to cancel {}: {}", log.agent_name, e);
                                    } else {
                                        cancelled_agents.push(log.agent_name.clone());
                                    }
                                }

                                // Mark as cancelled if not already complete
                                if log.status != CronRunStatus::Success
                                    && log.status != CronRunStatus::Cancelled
                                    && log.status != CronRunStatus::Skipped {
                                    log.status = CronRunStatus::Cancelled;
                                    log.error = reason.clone().or(Some("Pipeline aborted".to_string()));
                                    if log.completed_at.is_none() {
                                        log.completed_at = Some(chrono::Utc::now().to_rfc3339());
                                    }

                                    // Write updated log
                                    if let Ok(updated_json) = serde_json::to_string_pretty(&log) {
                                        let _ = std::fs::write(&path, updated_json);
                                    }

                                    cancelled_runs.push(log.run_id.clone());

                                    // Emit status event
                                    let _ = OUTPUT_SENDER.send(CronOutputEvent {
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

// ========================
// Pipeline API Commands
// ========================

/// List all pipelines, optionally filtered by status
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

/// Retry a failed pipeline stage
#[tauri::command]
pub async fn retry_pipeline_stage(
    pipeline_id: String,
    stage_type: PipelineStageType,
) -> Result<String, String> {
    let pm = get_pipeline_manager_sync()?;
    let pipeline = pm.get_pipeline(&pipeline_id)?;

    // Find the stage
    let stage = pipeline.stages.iter()
        .find(|s| s.stage_type == stage_type)
        .ok_or("Stage not found")?;

    // Reset stage status and increment attempt
    pm.update_stage(
        &pipeline_id,
        stage_type.clone(),
        PipelineStageStatus::Pending,
        None,
        None,
    )?;

    // Trigger the appropriate agent based on stage type
    let output_sender = OUTPUT_SENDER.clone();
    let pid = pipeline_id.clone();

    match stage_type {
        PipelineStageType::Implementer => {
            // For implementer retry, we'd need to relaunch session
            if let Some(run_id) = &stage.run_id {
                let run_id_clone = run_id.clone();
                tokio::spawn(async move {
                    let _ = relaunch_cron_session_impl(
                        run_id_clone,
                        "Continue the implementation.".to_string(),
                        None,
                    ).await;
                });
            }
        }
        PipelineStageType::Analyzer => {
            // Re-trigger analyzer for the implementer run
            if let Some(impl_stage) = pipeline.stages.iter().find(|s| s.stage_type == PipelineStageType::Implementer) {
                if let Some(run_id) = &impl_stage.run_id {
                    let analyzed_run_id = run_id.clone();
                    tokio::spawn(async move {
                        // Build analyzer env vars
                        let mut env_vars = HashMap::new();
                        env_vars.insert("ANALYZED_RUN_ID".to_string(), analyzed_run_id.clone());
                        env_vars.insert("ANALYZED_AGENT".to_string(), "cron-idea-implementer".to_string());
                        env_vars.insert("PIPELINE_ID".to_string(), pid.clone());

                        let trigger_info = executor::AnalyzerTriggerInfo {
                            analyzer_agent: "cron-implementer-analyzer".to_string(),
                            env_vars,
                        };
                        trigger_post_run_analyzer(trigger_info, output_sender, Some(pid)).await;
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
                    trigger_qa_then_merge(
                        wt_path,
                        wt_branch,
                        base_commit,
                        "cron-idea-implementer".to_string(),
                        output_sender,
                        Some(pid),
                    ).await;
                });
            }
        }
        PipelineStageType::Merger => {
            if let (Some(wt_path), Some(wt_branch)) = (&pipeline.worktree_path, &pipeline.worktree_branch) {
                let wt_path = wt_path.clone();
                let wt_branch = wt_branch.clone();
                tokio::spawn(async move {
                    trigger_worktree_merger(
                        wt_path,
                        wt_branch,
                        output_sender,
                        Some(pid),
                    ).await;
                });
            }
        }
    }

    Ok(format!("Retrying {:?} stage for pipeline {}", stage_type, pipeline_id))
}

/// Skip a pipeline stage
#[tauri::command]
pub async fn skip_pipeline_stage_cmd(
    pipeline_id: String,
    stage_type: PipelineStageType,
    reason: String,
) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;
    let pipeline = pm.skip_stage(&pipeline_id, stage_type.clone(), &reason)?;

    // Determine what to do next based on which stage was skipped
    let output_sender = OUTPUT_SENDER.clone();
    let pid = pipeline_id.clone();

    match stage_type {
        PipelineStageType::Qa => {
            // Skipping QA goes directly to merger (risky but allowed)
            if let (Some(wt_path), Some(wt_branch)) = (&pipeline.worktree_path, &pipeline.worktree_branch) {
                let wt_path = wt_path.clone();
                let wt_branch = wt_branch.clone();
                tokio::spawn(async move {
                    trigger_worktree_merger(
                        wt_path,
                        wt_branch,
                        output_sender,
                        Some(pid),
                    ).await;
                });
            }
        }
        _ => {}
    }

    pm.get_pipeline(&pipeline_id)
}

/// Abort an entire pipeline
#[tauri::command]
pub async fn abort_pipeline_cmd(
    pipeline_id: String,
    reason: String,
) -> Result<Pipeline, String> {
    let pm = get_pipeline_manager_sync()?;

    // Get pipeline to find any running stages
    let pipeline = pm.get_pipeline(&pipeline_id)?;

    // Cancel any running agents
    for stage in &pipeline.stages {
        if stage.status == PipelineStageStatus::Running {
            let guard = CRONOS.read().await;
            if let Some(manager) = guard.as_ref() {
                let _ = executor::cancel_cron_agent(manager, &stage.agent_name).await;
            }
        }
    }

    // Mark pipeline as aborted
    pm.abort_pipeline(&pipeline_id, &reason)
}

// ========================
// Pipeline Definition API
// ========================

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

/// Get the default pipeline definition (idea-to-merge)
#[tauri::command]
pub async fn get_default_pipeline_definition() -> Result<PipelineDefinition, String> {
    let pm = get_pipeline_manager_sync()?;
    pm.get_default_definition()
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
