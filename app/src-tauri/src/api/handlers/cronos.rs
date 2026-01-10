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

/// Read CLAUDE.md for a cron agent
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

/// Write CLAUDE.md for a cron agent
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
