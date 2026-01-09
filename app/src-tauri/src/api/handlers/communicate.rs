//! Communication HTTP handlers

use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::commands::communicator;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Send message request
#[derive(Deserialize)]
pub struct SendMessageRequest {
    team: String,
    target: String,
    message: String,
}

/// Send message to agent
pub async fn send_message(
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match communicator::send_message(req.team, req.target, req.message).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Send command request
#[derive(Deserialize)]
pub struct SendCommandRequest {
    session: String,
    command: String,
}

/// Send command to agent
pub async fn send_command(
    Json(req): Json<SendCommandRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::send_agent_command(req.session, req.command).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Broadcast team request
#[derive(Deserialize)]
pub struct BroadcastTeamRequest {
    #[serde(alias = "teamName")]
    team_name: String,
    message: String,
}

/// Broadcast to team
pub async fn broadcast_team(
    Json(req): Json<BroadcastTeamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match communicator::broadcast_team(req.team_name, req.message).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Broadcast all request
#[derive(Deserialize)]
pub struct BroadcastAllRequest {
    #[serde(alias = "teamName")]
    team_name: String,
    message: String,
}

/// Broadcast to all agents
pub async fn broadcast_all(
    Json(req): Json<BroadcastAllRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match communicator::broadcast_all(req.team_name, req.message).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
