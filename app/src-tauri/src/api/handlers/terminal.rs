//! Terminal HTTP handlers
//!
//! Terminal streaming uses WebSocket at /api/ws/terminal/:session
//! These REST endpoints handle control operations.

use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Start stream request
#[derive(Deserialize)]
pub struct StartStreamRequest {
    session: String,
}

/// Start terminal stream - in browser mode, just returns success
/// The actual streaming happens via WebSocket at /api/ws/terminal/:session
pub async fn start_stream(
    Json(req): Json<StartStreamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    // In HTTP mode, we don't need to start a stream - the WebSocket handles it
    // Just verify the session exists
    match crate::tmux::session::session_exists(&req.session) {
        Ok(true) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Use WebSocket at /api/ws/terminal/:session for streaming",
            "ws_url": format!("/api/ws/terminal/{}", req.session)
        }))),
        Ok(false) => Err(error_response(
            StatusCode::NOT_FOUND,
            format!("Session '{}' does not exist", req.session),
        )),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Stop stream request
#[derive(Deserialize)]
pub struct StopStreamRequest {
    session: String,
}

/// Stop terminal stream
pub async fn stop_stream(
    Json(req): Json<StopStreamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::stop_terminal_stream(req.session).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Send input request
#[derive(Deserialize)]
pub struct SendInputRequest {
    session: String,
    data: String,
}

/// Send terminal input
pub async fn send_input(
    Json(req): Json<SendInputRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::send_terminal_input(req.session, req.data).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Send key request
#[derive(Deserialize)]
pub struct SendKeyRequest {
    session: String,
    key: String,
}

/// Send terminal key
pub async fn send_key(
    Json(req): Json<SendKeyRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::send_terminal_key(req.session, req.key).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Resize request
#[derive(Deserialize)]
pub struct ResizeRequest {
    session: String,
    cols: u32,
    rows: u32,
}

/// Resize terminal
pub async fn resize(
    Json(req): Json<ResizeRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match crate::commands::lifecycle::resize_terminal(req.session, req.cols, req.rows).await {
        Ok(result) => Ok(Json(serde_json::json!({ "result": result }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
