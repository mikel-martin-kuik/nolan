//! Team management HTTP handlers

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::commands::teams;
use crate::config::{TeamConfig, DepartmentsConfig};

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// List all teams
pub async fn list_teams() -> Result<Json<Vec<String>>, impl IntoResponse> {
    match teams::list_teams().await {
        Ok(teams) => Ok(Json(teams)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get team configuration
pub async fn get_team(
    Path(name): Path<String>,
) -> Result<Json<TeamConfig>, impl IntoResponse> {
    match teams::get_team_config(name).await {
        Ok(config) => Ok(Json(config)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Update team configuration
pub async fn update_team(
    Path(name): Path<String>,
    Json(config): Json<TeamConfig>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::save_team_config(name, config).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete team
pub async fn delete_team(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::delete_team(name).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Rename team
pub async fn rename_team(
    Path((old_name, new_name)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::rename_team_config(old_name, new_name).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get departments configuration
pub async fn get_departments() -> Result<Json<DepartmentsConfig>, impl IntoResponse> {
    match teams::get_departments_config().await {
        Ok(config) => Ok(Json(config)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Update departments configuration
pub async fn update_departments(
    Json(config): Json<DepartmentsConfig>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::save_departments_config(config).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
