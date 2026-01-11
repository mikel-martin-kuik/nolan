//! Project management HTTP handlers

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::commands::projects::{self, ProjectInfo, ProjectFile};
use crate::commands::teams;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// List all projects
pub async fn list_projects() -> Result<Json<Vec<ProjectInfo>>, impl IntoResponse> {
    match projects::list_projects().await {
        Ok(projects) => Ok(Json(projects)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Create project request
#[derive(Deserialize)]
pub struct CreateProjectRequest {
    name: String,
    team_name: Option<String>,
}

/// Create a new project
pub async fn create_project(
    Json(req): Json<CreateProjectRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match projects::create_project(req.name, req.team_name).await {
        Ok(path) => Ok(Json(serde_json::json!({ "path": path }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// List project files
pub async fn list_files(
    Path(name): Path<String>,
) -> Result<Json<Vec<ProjectFile>>, impl IntoResponse> {
    match projects::list_project_files(name).await {
        Ok(files) => Ok(Json(files)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Read file query params
#[derive(Deserialize)]
pub struct ReadFileQuery {
    path: String,
}

/// Read a project file
pub async fn read_file(
    Path(name): Path<String>,
    Query(query): Query<ReadFileQuery>,
) -> Result<Json<String>, impl IntoResponse> {
    match projects::read_project_file(name, query.path).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Write file request
#[derive(Deserialize)]
pub struct WriteFileRequest {
    #[serde(alias = "file_path", alias = "filePath")]
    path: String,
    content: String,
}

/// Write a project file
pub async fn write_file(
    Path(name): Path<String>,
    Json(req): Json<WriteFileRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match projects::write_project_file(name, req.path, req.content).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Get project team
pub async fn get_team(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::get_project_team(name).await {
        Ok(team) => Ok(Json(serde_json::json!({ "team": team }))),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Set team request
#[derive(Deserialize)]
pub struct SetTeamRequest {
    team_name: String,
}

/// Set project team
pub async fn set_team(
    Path(name): Path<String>,
    Json(req): Json<SetTeamRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match teams::set_project_team(name, req.team_name).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Query params for roadmap endpoint
#[derive(Deserialize)]
pub struct RoadmapQuery {
    file: Option<String>,
}

/// Read a roadmap file (roadmap.md, business_roadmap.md, or product_roadmap.md)
pub async fn read_roadmap(
    Query(query): Query<RoadmapQuery>,
) -> Result<Json<String>, impl IntoResponse> {
    match projects::read_roadmap(query.file).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// List available roadmap files
pub async fn list_roadmap_files() -> Result<Json<Vec<String>>, impl IntoResponse> {
    match projects::list_roadmap_files().await {
        Ok(files) => Ok(Json(files)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Update project status request
#[derive(Deserialize)]
pub struct UpdateStatusRequest {
    status: String,
}

/// Update project status marker
pub async fn update_status(
    Path(name): Path<String>,
    Json(req): Json<UpdateStatusRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match projects::update_project_status(name, req.status).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Update file marker request
#[derive(Deserialize)]
pub struct UpdateFileMarkerRequest {
    #[serde(alias = "file_path", alias = "filePath")]
    file_path: String,
    completed: bool,
    #[serde(alias = "agent_name", alias = "agentName")]
    agent_name: Option<String>,
}

/// Update HANDOFF marker in a workflow file
pub async fn update_file_marker(
    Path(name): Path<String>,
    Json(req): Json<UpdateFileMarkerRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match projects::update_file_marker(name, req.file_path, req.completed, req.agent_name).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
