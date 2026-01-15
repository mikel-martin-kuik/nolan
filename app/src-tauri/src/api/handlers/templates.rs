//! Agent template HTTP handlers

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::api::AppState;
use crate::commands::templates;
use crate::templates::TemplateInfo;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// List all available agent templates
pub async fn list_templates(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<TemplateInfo>>, impl IntoResponse> {
    match templates::list_agent_templates().await {
        Ok(templates) => Ok(Json(templates)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}
