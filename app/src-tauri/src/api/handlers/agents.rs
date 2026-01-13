//! Agent management HTTP handlers

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::AppState;
use crate::commands::agents::{
    self, AgentDirectoryInfo, AgentMetadata,
};

/// Get agent template query params
#[derive(Deserialize)]
pub struct GetTemplateQuery {
    name: String,
    role: String,
}

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// List all agents
pub async fn list_agents(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<AgentDirectoryInfo>>, impl IntoResponse> {
    match agents::list_agent_directories().await {
        Ok(agents) => Ok(Json(agents)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get agent details
pub async fn get_agent(
    Path(name): Path<String>,
) -> Result<Json<Option<AgentMetadata>>, impl IntoResponse> {
    match agents::get_agent_metadata(name).await {
        Ok(metadata) => Ok(Json(metadata)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Create agent request
#[derive(Deserialize)]
pub struct CreateAgentRequest {
    name: String,
    /// Optional team name - if provided, creates in teams/{team}/agents/, else in agents/
    team_name: Option<String>,
}

/// Create a new agent
/// If team_name is provided, creates in teams/{team}/agents/{name}/
/// Otherwise creates in shared agents/ directory
pub async fn create_agent(
    Json(req): Json<CreateAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match agents::create_agent_directory(req.name, req.team_name).await {
        Ok(path) => Ok(Json(serde_json::json!({ "path": path }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Update agent metadata request
#[derive(Deserialize)]
pub struct UpdateAgentRequest {
    role: String,
    model: String,
}

/// Update agent metadata
pub async fn update_agent(
    Path(name): Path<String>,
    Json(req): Json<UpdateAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match agents::save_agent_metadata(name, req.role, req.model).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete agent query params
#[derive(Deserialize)]
pub struct DeleteAgentQuery {
    #[serde(default)]
    force: bool,
}

/// Delete an agent
pub async fn delete_agent(
    Path(name): Path<String>,
    Query(query): Query<DeleteAgentQuery>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match agents::delete_agent_directory(name, query.force).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get agent CLAUDE.md (role file)
pub async fn get_agent_role(
    Path(name): Path<String>,
) -> Result<Json<String>, impl IntoResponse> {
    match agents::get_agent_role_file(name).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Update agent role request
#[derive(Deserialize)]
pub struct UpdateRoleRequest {
    content: String,
}

/// Update agent CLAUDE.md (role file)
pub async fn update_agent_role(
    Path(name): Path<String>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match agents::save_agent_role_file(name, req.content).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get agent CLAUDE.md via lifecycle command
pub async fn get_claude_md(
    Path(name): Path<String>,
) -> Result<Json<String>, impl IntoResponse> {
    match crate::commands::lifecycle::read_agent_claude_md(name).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Update agent CLAUDE.md via lifecycle command
pub async fn update_claude_md(
    Path(name): Path<String>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::write_agent_claude_md(name, req.content).await {
        Ok(result) => Ok(Json(serde_json::json!({ "success": true, "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get agent template
pub async fn get_template(
    Query(query): Query<GetTemplateQuery>,
) -> Result<Json<String>, impl IntoResponse> {
    match agents::get_agent_template(query.name, query.role).await {
        Ok(template) => Ok(Json(template)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
