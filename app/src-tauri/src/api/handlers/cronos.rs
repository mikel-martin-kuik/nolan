//! Cronos (cron agents) HTTP handlers

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::cronos::commands;
use crate::cronos::types::CronAgentConfig;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// List all cron agents
pub async fn list_agents() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::list_cron_agents().await {
        Ok(agents) => Ok(Json(serde_json::json!(agents))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get a specific cron agent
pub async fn get_agent(
    Path(name): Path<String>,
) -> Result<Json<CronAgentConfig>, impl IntoResponse> {
    match commands::get_cron_agent(name).await {
        Ok(agent) => Ok(Json(agent)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Create cron agent request (matches frontend invoke args)
#[derive(Deserialize)]
pub struct CreateCronAgentRequest {
    config: CronAgentConfig,
}

/// Create a new cron agent
pub async fn create_agent(
    Json(req): Json<CreateCronAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::create_cron_agent(req.config).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Update cron agent request
#[derive(Deserialize)]
pub struct UpdateCronAgentRequest {
    config: CronAgentConfig,
}

/// Update a cron agent
pub async fn update_agent(
    Path(name): Path<String>,
    Json(req): Json<UpdateCronAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::update_cron_agent(name, req.config).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete a cron agent
pub async fn delete_agent(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::delete_cron_agent(name).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Toggle request
#[derive(Deserialize)]
pub struct ToggleRequest {
    enabled: bool,
}

/// Toggle a cron agent on/off
pub async fn toggle_agent(
    Path(name): Path<String>,
    Json(req): Json<ToggleRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::toggle_cron_agent(name, req.enabled).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Test a cron agent (dry run)
pub async fn test_agent(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::test_cron_agent(name).await {
        Ok(result) => Ok(Json(serde_json::json!(result))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Trigger a cron agent to run now
pub async fn trigger_agent(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::trigger_cron_agent_api(name).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get run history for a cron agent
pub async fn get_run_history(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_cron_run_history(Some(name), None).await {
        Ok(history) => Ok(Json(serde_json::json!(history))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get all run history query params
#[derive(Deserialize)]
pub struct AllHistoryQuery {
    limit: Option<usize>,
}

/// Get run history for all cron agents
pub async fn get_all_run_history(
    Query(query): Query<AllHistoryQuery>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_cron_run_history(None, query.limit).await {
        Ok(history) => Ok(Json(serde_json::json!(history))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get log for a specific run
pub async fn get_run_log(
    Path(run_id): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_cron_run_log(run_id).await {
        Ok(log) => Ok(Json(serde_json::json!({ "log": log }))),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Relaunch session request
#[derive(Deserialize)]
pub struct RelaunchSessionRequest {
    #[serde(rename = "followUpPrompt")]
    follow_up_prompt: String,
}

/// Relaunch a cron agent session using Claude's --resume flag
pub async fn relaunch_session(
    Path(run_id): Path<String>,
    Json(req): Json<RelaunchSessionRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::relaunch_cron_session_api(run_id, req.follow_up_prompt).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Read CLAUDE.md for an agent
pub async fn read_claude_md(
    Path(name): Path<String>,
) -> Result<Json<String>, impl IntoResponse> {
    match commands::read_cron_agent_claude_md(name).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Write CLAUDE.md request
#[derive(Deserialize)]
pub struct WriteClaudeMdRequest {
    content: String,
}

/// Write CLAUDE.md for an agent
pub async fn write_claude_md(
    Path(name): Path<String>,
    Json(req): Json<WriteClaudeMdRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::write_cron_agent_claude_md(name, req.content).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Initialize cronos scheduler
pub async fn init() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::init_cronos().await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Shutdown cronos scheduler
pub async fn shutdown() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::shutdown_cronos().await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Cancel a running cron agent
pub async fn cancel_agent(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::cancel_cron_agent(name).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get currently running agents
pub async fn get_running() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_running_agents().await {
        Ok(agents) => Ok(Json(serde_json::json!(agents))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get overall cronos health summary
pub async fn get_health() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_cronos_health().await {
        Ok(health) => Ok(Json(serde_json::json!(health))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get statistics for a specific agent
pub async fn get_agent_stats(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_agent_stats(name).await {
        Ok(stats) => Ok(Json(serde_json::json!(stats))),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

// ========================
// Group Management
// ========================

use crate::cronos::types::CronAgentGroup;

/// List all cron groups
pub async fn list_groups() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::list_cron_groups().await {
        Ok(groups) => Ok(Json(serde_json::json!(groups))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get a specific group
pub async fn get_group(
    Path(group_id): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_cron_group(group_id).await {
        Ok(group) => Ok(Json(serde_json::json!(group))),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Create group request
#[derive(Deserialize)]
pub struct CreateGroupRequest {
    group: CronAgentGroup,
}

/// Create a new group
pub async fn create_group(
    Json(req): Json<CreateGroupRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::create_cron_group(req.group).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Update group request
#[derive(Deserialize)]
pub struct UpdateGroupRequest {
    group: CronAgentGroup,
}

/// Update an existing group
pub async fn update_group(
    Path(_group_id): Path<String>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::update_cron_group(req.group).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete a group
pub async fn delete_group(
    Path(group_id): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::delete_cron_group(group_id).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Set agent group request
#[derive(Deserialize)]
pub struct SetAgentGroupRequest {
    #[serde(rename = "groupId")]
    group_id: Option<String>,
}

/// Set an agent's group
pub async fn set_agent_group(
    Path(agent_name): Path<String>,
    Json(req): Json<SetAgentGroupRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::set_agent_group(agent_name, req.group_id).await {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ========================
// Idea Dispatch
// ========================

/// Dispatch all unprocessed ideas for processing
pub async fn dispatch_ideas() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::dispatch_ideas_api().await {
        Ok(result) => Ok(Json(serde_json::json!(result))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

// ========================
// Worktree Management
// ========================

use crate::git::worktree;

/// List all active worktrees
pub async fn list_worktrees() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    // Get the nolan root to find git repo
    let nolan_root = match crate::utils::paths::get_nolan_root() {
        Ok(root) => root,
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    };

    match worktree::list_worktrees(&nolan_root) {
        Ok(worktrees) => Ok(Json(serde_json::json!(worktrees))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Cleanup orphaned worktrees (no associated running process)
pub async fn cleanup_orphaned_worktrees() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    let nolan_root = match crate::utils::paths::get_nolan_root() {
        Ok(root) => root,
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    };

    // Prune any stale worktree entries
    if let Err(e) = worktree::prune_worktrees(&nolan_root) {
        return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

/// Remove worktree request
#[derive(Deserialize)]
pub struct RemoveWorktreeRequest {
    pub path: String,
    #[serde(default)]
    pub force: bool,
}

/// Remove a specific worktree
pub async fn remove_worktree(
    Json(req): Json<RemoveWorktreeRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    let nolan_root = match crate::utils::paths::get_nolan_root() {
        Ok(root) => root,
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    };

    let worktree_path = std::path::PathBuf::from(&req.path);
    match worktree::remove_worktree(&nolan_root, &worktree_path, req.force) {
        Ok(_) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ========================
// Pipeline Stage Actions
// ========================

/// Skip stage request
#[derive(Deserialize)]
pub struct SkipStageRequest {
    #[serde(default)]
    pub reason: Option<String>,
}

/// Skip a pipeline stage
pub async fn skip_stage(
    Path(run_id): Path<String>,
    Json(req): Json<SkipStageRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::skip_pipeline_stage(run_id, req.reason).await {
        Ok(log) => Ok(Json(serde_json::json!(log))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Abort pipeline request
#[derive(Deserialize)]
pub struct AbortPipelineRequest {
    #[serde(default)]
    pub reason: Option<String>,
}

/// Abort an entire pipeline
pub async fn abort_pipeline(
    Path(pipeline_id): Path<String>,
    Json(req): Json<AbortPipelineRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::abort_pipeline(pipeline_id, req.reason).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

#[derive(Debug, Deserialize)]
pub struct CompletePipelineRequest {
    #[serde(default)]
    pub reason: Option<String>,
}

/// Manually mark a pipeline as completed
pub async fn complete_pipeline(
    Path(pipeline_id): Path<String>,
    Json(req): Json<CompletePipelineRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::complete_pipeline(pipeline_id, req.reason).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ========================
// Pipeline Definition & Listing
// ========================

/// List all pipelines
pub async fn list_pipelines() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::list_pipelines(None).await {
        Ok(pipelines) => Ok(Json(serde_json::to_value(pipelines).unwrap_or_default())),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get pipeline by ID
pub async fn get_pipeline(
    Path(pipeline_id): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_pipeline(pipeline_id).await {
        Ok(pipeline) => Ok(Json(serde_json::to_value(pipeline).unwrap_or_default())),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// List all pipeline definitions
pub async fn list_pipeline_definitions() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::list_pipeline_definitions().await {
        Ok(definitions) => Ok(Json(serde_json::to_value(definitions).unwrap_or_default())),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get pipeline definition by name
pub async fn get_pipeline_definition(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_pipeline_definition(name).await {
        Ok(definition) => Ok(Json(serde_json::to_value(definition).unwrap_or_default())),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Get the default pipeline definition
pub async fn get_default_pipeline_definition() -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match commands::get_default_pipeline_definition().await {
        Ok(definition) => Ok(Json(serde_json::to_value(definition).unwrap_or_default())),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}
