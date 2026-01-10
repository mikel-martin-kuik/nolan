//! HTTP request handlers

pub mod agents;
pub mod communicate;
pub mod cronos;
pub mod history;
pub mod lifecycle;
pub mod projects;
pub mod teams;
pub mod terminal;
pub mod usage;
pub mod organization;
pub mod roles;
pub mod policies;

use axum::Json;
use serde::Serialize;

/// Health check response
#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

/// Health check endpoint
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// No-op endpoint for commands that don't work in browser mode
/// Returns success without doing anything
pub async fn noop() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "noop", "message": "This operation is not available in browser mode" }))
}
