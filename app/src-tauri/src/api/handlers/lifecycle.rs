//! Agent lifecycle HTTP handlers
//!
//! Note: Status change events are not emitted in HTTP mode.
//! Frontend should poll get_status for updates.

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::commands::lifecycle::{self, AgentStatusList};
use crate::commands::lifecycle_core;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Launch team request
#[derive(Deserialize)]
pub struct LaunchTeamRequest {
    #[serde(alias = "teamName")]
    team_name: String,
    #[allow(dead_code)]
    #[serde(alias = "projectName")]
    project_name: String,
    #[allow(dead_code)]
    #[serde(alias = "initialPrompt")]
    initial_prompt: Option<String>,
    #[allow(dead_code)]
    #[serde(alias = "updatedOriginalPrompt")]
    updated_original_prompt: Option<String>,
    #[allow(dead_code)]
    #[serde(alias = "followupPrompt")]
    followup_prompt: Option<String>,
}

/// Launch team - starts all team agents
/// Note: Does not set active project or send initial prompt (use separate calls)
pub async fn launch_team(
    Json(req): Json<LaunchTeamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    // Load team config
    let team = crate::config::TeamConfig::load(&req.team_name)
        .map_err(|e| error_response(StatusCode::BAD_REQUEST, e))?;

    let mut started = Vec::new();
    let mut errors = Vec::new();

    // Start each workflow participant
    for agent in team.workflow_participants() {
        match lifecycle_core::start_agent_core(&req.team_name, agent).await {
            Ok(session) => started.push(session),
            Err(e) => {
                // Skip already running agents
                if !e.contains("already exists") {
                    errors.push(format!("{}: {}", agent, e));
                }
            }
        }
    }

    if !errors.is_empty() && started.is_empty() {
        Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, errors.join("; ")))
    } else {
        Ok(Json(serde_json::json!({
            "started": started,
            "errors": errors
        })))
    }
}

/// Kill team request
#[derive(Deserialize)]
pub struct KillTeamRequest {
    #[serde(alias = "teamName")]
    team_name: String,
}

/// Kill team - kills all team agents
pub async fn kill_team(
    Json(req): Json<KillTeamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::kill_team_sessions(&req.team_name) {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Start agent request
#[derive(Deserialize)]
pub struct StartAgentRequest {
    #[serde(alias = "teamName")]
    team_name: String,
    agent: String,
}

/// Start agent - starts a single team agent
pub async fn start_agent(
    Json(req): Json<StartAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::start_agent_core(&req.team_name, &req.agent).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Spawn agent request
#[derive(Deserialize)]
pub struct SpawnAgentRequest {
    #[allow(dead_code)]
    #[serde(alias = "teamName")]
    team_name: Option<String>,
    #[allow(dead_code)]
    agent: Option<String>,
    #[serde(default)]
    force: bool,
    model: Option<String>,
}

/// Spawn agent (Ralph only)
pub async fn spawn_agent(
    Json(req): Json<SpawnAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::spawn_ralph_core(req.model, req.force).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Kill instance request
#[derive(Deserialize)]
pub struct KillInstanceRequest {
    session: String,
}

/// Kill instance - kills a specific session
pub async fn kill_instance(
    Json(req): Json<KillInstanceRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::kill_session(&req.session) {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Kill all request
#[derive(Deserialize)]
pub struct KillAllRequest {
    #[serde(alias = "teamName")]
    team_name: String,
    #[allow(dead_code)]
    agent: String,
}

/// Kill all instances for a team
pub async fn kill_all(
    Json(req): Json<KillAllRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::kill_team_sessions(&req.team_name) {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get all agent status - returns all running agents
pub async fn get_all_status() -> Result<Json<AgentStatusList>, impl IntoResponse> {
    match lifecycle::get_agent_status().await {
        Ok(status) => Ok(Json(status)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get agent status for a specific agent - returns all running agents (filtered by caller if needed)
pub async fn get_status(
    Path(_agent): Path<String>,
) -> Result<Json<AgentStatusList>, impl IntoResponse> {
    match lifecycle::get_agent_status().await {
        Ok(status) => Ok(Json(status)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// List sessions - returns all tmux sessions
pub async fn list_sessions() -> Result<Json<Vec<String>>, impl IntoResponse> {
    match crate::tmux::session::list_sessions() {
        Ok(sessions) => Ok(Json(sessions)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}
