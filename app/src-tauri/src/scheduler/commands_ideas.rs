//! scheduler/commands_ideas.rs
//!
//! Idea dispatch and routing system.
//! Handles processing ideas from the inbox and routing them
//! to appropriate agents based on complexity.
//!
//! Entry points:
//! - `dispatch_ideas()` - Dispatch all unprocessed ideas
//! - `dispatch_single_idea()` - Dispatch a specific idea
//! - `route_accepted_idea()` - Route an accepted idea to implementer or project

use tauri::{AppHandle, Emitter};

use super::executor;
use super::types::*;
use super::commands::{SCHEDULER, OUTPUT_SENDER, get_pipeline_manager_sync};
use super::commands_analyzer::trigger_post_run_analyzer;
use crate::config::get_pipeline_entrypoint_file;

// === INTERNAL TYPES ===

#[derive(Clone, Debug, serde::Deserialize)]
struct Idea {
    id: String,
    title: String,
    #[allow(dead_code)]
    description: String,
    status: String,
}

#[derive(Clone, Debug, serde::Deserialize)]
struct InboxReview {
    item_id: String,
    #[allow(dead_code)]
    review_status: String,
}

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

// === PUBLIC TYPES ===

#[derive(Clone, Debug, serde::Serialize)]
pub struct DispatchResult {
    pub dispatched: Vec<String>,
    pub already_reviewed: usize,
    pub already_processing: usize,
    pub inactive: usize,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RouteResult {
    pub idea_id: String,
    pub route: String,
    pub detail: String,
}

// === HELPER FUNCTIONS ===

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
            Err(e) => eprintln!(
                "Warning: Failed to parse line {} in {}: {}",
                line_num + 1,
                path.display(),
                e
            ),
        }
    }

    Ok(items)
}

// === TAURI COMMANDS ===

/// Dispatch unprocessed ideas to configured idea-processor agent
#[tauri::command]
pub async fn dispatch_ideas(app: AppHandle) -> Result<DispatchResult, String> {
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<InboxReview>(&reviews_path).unwrap_or_default();

    let reviewed_ids: std::collections::HashSet<_> =
        reviews.iter().map(|r| r.item_id.as_str()).collect();

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let processor_agent = crate::config::get_idea_processor_agent();
    let processor_config = manager.get_agent(&processor_agent).await?;

    let mut result = DispatchResult {
        dispatched: Vec::new(),
        already_reviewed: 0,
        already_processing: 0,
        inactive: 0,
    };

    let output_sender = OUTPUT_SENDER.clone();

    let app_clone = app.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app_clone.emit("scheduler:output", &event);
        }
    });

    for idea in ideas {
        if idea.status != "active" {
            result.inactive += 1;
            continue;
        }

        if reviewed_ids.contains(idea.id.as_str()) {
            result.already_reviewed += 1;
            continue;
        }

        let mut extra_env = executor::ExtraEnvVars::new();
        extra_env.insert("IDEA_ID".to_string(), idea.id.clone());
        extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

        let config = processor_config.clone();
        let sender = output_sender.clone();
        let label = Some(idea.title.clone());

        tokio::spawn(async move {
            let guard = SCHEDULER.read().await;
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
                )
                .await
                {
                    eprintln!("Idea processor failed: {}", e);
                }
            }
        });

        result.dispatched.push(idea.id);
    }

    Ok(result)
}

/// Dispatch a single idea to configured idea-processor agent
#[tauri::command(rename_all = "snake_case")]
pub async fn dispatch_single_idea(idea_id: String, app: AppHandle) -> Result<String, String> {
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    let idea = ideas
        .iter()
        .find(|i| i.id == idea_id)
        .ok_or_else(|| format!("Idea {} not found", idea_id))?;

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let processor_agent = crate::config::get_idea_processor_agent();
    let processor_config = manager.get_agent(&processor_agent).await?;

    let output_sender = OUTPUT_SENDER.clone();

    let app_clone = app.clone();
    let mut receiver = output_sender.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = receiver.recv().await {
            let _ = app_clone.emit("scheduler:output", &event);
        }
    });

    let mut extra_env = executor::ExtraEnvVars::new();
    extra_env.insert("IDEA_ID".to_string(), idea_id.clone());
    extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

    drop(guard);

    let config = processor_config.clone();
    let sender = output_sender.clone();
    let label = Some(idea.title.clone());

    tokio::spawn(async move {
        let guard = SCHEDULER.read().await;
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
            )
            .await
            {
                eprintln!("Idea processor failed: {}", e);
            }
        }
    });

    Ok(format!("Dispatched idea {} for processing", idea_id))
}

/// Dispatch unprocessed ideas via HTTP API (no AppHandle required)
pub async fn dispatch_ideas_api() -> Result<DispatchResult, String> {
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;

    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<InboxReview>(&reviews_path).unwrap_or_default();

    let reviewed_ids: std::collections::HashSet<_> =
        reviews.iter().map(|r| r.item_id.as_str()).collect();

    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let processor_agent = crate::config::get_idea_processor_agent();
    let processor_config = manager.get_agent(&processor_agent).await?;

    let mut result = DispatchResult {
        dispatched: Vec::new(),
        already_reviewed: 0,
        already_processing: 0,
        inactive: 0,
    };

    let output_sender = OUTPUT_SENDER.clone();

    for idea in ideas {
        if idea.status != "active" {
            result.inactive += 1;
            continue;
        }

        if reviewed_ids.contains(idea.id.as_str()) {
            result.already_reviewed += 1;
            continue;
        }

        let mut extra_env = executor::ExtraEnvVars::new();
        extra_env.insert("IDEA_ID".to_string(), idea.id.clone());
        extra_env.insert("IDEA_TITLE".to_string(), idea.title.clone());

        let config = processor_config.clone();
        let sender = output_sender.clone();
        let label = Some(idea.title.clone());

        tokio::spawn(async move {
            let guard = SCHEDULER.read().await;
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
                )
                .await
                {
                    eprintln!("Idea processor failed: {}", e);
                }
            }
        });

        result.dispatched.push(idea.id);
    }

    Ok(result)
}

/// Route an accepted idea based on complexity
pub async fn route_accepted_idea(idea_id: String) -> Result<RouteResult, String> {
    let feedback_dir = crate::utils::paths::get_feedback_dir()?;

    let ideas_path = feedback_dir.join("ideas.jsonl");
    let ideas = read_jsonl_file::<Idea>(&ideas_path)?;
    let idea = ideas
        .iter()
        .find(|i| i.id == idea_id)
        .ok_or_else(|| format!("Idea {} not found", idea_id))?;

    let reviews_path = feedback_dir.join("inbox-reviews.jsonl");
    let reviews = read_jsonl_file::<ReviewForRouting>(&reviews_path)?;
    let review = reviews
        .iter()
        .find(|r| r.item_id == idea_id)
        .ok_or_else(|| format!("Review for idea {} not found", idea_id))?;

    let complexity = review.complexity.as_deref().unwrap_or("medium");

    match complexity {
        "low" | "medium" => {
            route_to_implementer(&idea_id, &idea.title).await
        }
        _ => {
            route_to_project(&idea_id, idea, review).await
        }
    }
}

async fn route_to_implementer(idea_id: &str, idea_title: &str) -> Result<RouteResult, String> {
    let guard = SCHEDULER.read().await;
    let manager = guard.as_ref().ok_or("Scheduler not initialized")?;

    let config = manager.get_agent("idea-implementer").await?;
    let output_sender = OUTPUT_SENDER.clone();

    let pipeline_id = format!("pipeline-{}", idea_id);

    let mut extra_env = executor::ExtraEnvVars::new();
    extra_env.insert("IDEA_ID".to_string(), idea_id.to_string());
    extra_env.insert("IDEA_TITLE".to_string(), idea_title.to_string());
    extra_env.insert("PIPELINE_ID".to_string(), pipeline_id.clone());

    let label = Some(idea_title.to_string());
    let idea_id_clone = idea_id.to_string();
    let idea_title_clone = idea_title.to_string();
    let extra_env_clone = extra_env.clone();

    tokio::spawn(async move {
        let guard = SCHEDULER.read().await;
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
            )
            .await
            {
                Ok(run_log) => {
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
                                let stage_status = match run_log.status {
                                    ScheduledRunStatus::Success => PipelineStageStatus::Success,
                                    ScheduledRunStatus::Failed | ScheduledRunStatus::Timeout => {
                                        PipelineStageStatus::Failed
                                    }
                                    _ => PipelineStageStatus::Success,
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

                    if let Some(mut trigger_info) = executor::get_analyzer_trigger_info(&config, &run_log) {
                        trigger_info.env_vars.insert("PIPELINE_ID".to_string(), pipeline_id.clone());
                        trigger_post_run_analyzer(trigger_info, output_sender, Some(pipeline_id)).await;
                    }
                }
                Err(e) => eprintln!("Idea implementer failed: {}", e),
            }
        }
    });

    Ok(RouteResult {
        idea_id: idea_id.to_string(),
        route: "implementer".to_string(),
        detail: "triggered".to_string(),
    })
}

async fn route_to_project(idea_id: &str, idea: &Idea, review: &ReviewForRouting) -> Result<RouteResult, String> {
    let proposal = review.proposal.as_ref().ok_or("Review has no proposal")?;

    let project_name = proposal
        .title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join("-");

    let projects_dir = crate::utils::paths::get_projects_dir()?;
    let existing_project_path = projects_dir.join(&project_name);
    let project_exists = existing_project_path.exists();

    let project_path = if project_exists {
        eprintln!("Project '{}' already exists", project_name);
        existing_project_path.to_string_lossy().to_string()
    } else {
        crate::commands::projects::create_project(project_name.clone(), None).await?
    };

    let entrypoint_file = get_pipeline_entrypoint_file();
    if !project_exists {
        let qa_section = build_qa_section(&review.gaps);

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

        let spec_path = std::path::Path::new(&project_path).join(&entrypoint_file);
        std::fs::write(&spec_path, spec_content)
            .map_err(|e| format!("Failed to write {}: {}", entrypoint_file, e))?;
    }

    Ok(RouteResult {
        idea_id: idea_id.to_string(),
        route: "project".to_string(),
        detail: project_name,
    })
}

fn build_qa_section(gaps: &[GapForRouting]) -> String {
    let answered_gaps: Vec<_> = gaps.iter().filter(|g| g.value.is_some()).collect();
    let unanswered_required: Vec<_> = gaps.iter().filter(|g| g.value.is_none() && g.required).collect();

    if answered_gaps.is_empty() && unanswered_required.is_empty() {
        return String::new();
    }

    let mut qa = String::from("\n## Requirements\n\n");

    for gap in answered_gaps {
        if let Some(value) = &gap.value {
            qa.push_str(&format!("**{}**: {}\n", gap.label, value));
            qa.push_str(&format!("*{}*\n\n", gap.description));
        }
    }

    if !unanswered_required.is_empty() {
        qa.push_str("### TODO: Unanswered Required Questions\n\n");
        for gap in unanswered_required {
            qa.push_str(&format!("- [ ] **{}**: {}\n", gap.label, gap.description));
        }
        qa.push('\n');
    }

    qa
}
