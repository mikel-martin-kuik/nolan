//! File system HTTP handlers

use axum::{extract::Query, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

use crate::commands::filesystem::{
    self, DirectoryContents, FileContent, FileSystemEntry, SearchResult,
};

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Query params for browse endpoint
#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: String,
    #[serde(alias = "showHidden")]
    pub show_hidden: Option<bool>,
}

/// Browse a directory
pub async fn browse_directory(
    Query(query): Query<BrowseQuery>,
) -> Result<Json<DirectoryContents>, impl IntoResponse> {
    match filesystem::browse_directory(query.path, query.show_hidden).await {
        Ok(contents) => Ok(Json(contents)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Query params for read endpoint
#[derive(Deserialize)]
pub struct ReadQuery {
    pub path: String,
}

/// Read file content
pub async fn read_file(
    Query(query): Query<ReadQuery>,
) -> Result<Json<FileContent>, impl IntoResponse> {
    match filesystem::read_file_content(query.path).await {
        Ok(content) => Ok(Json(content)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Write file request body
#[derive(Deserialize)]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

/// Write file content
pub async fn write_file(
    Json(req): Json<WriteFileRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match filesystem::write_file_content(req.path, req.content).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Query params for search endpoint
#[derive(Deserialize)]
pub struct SearchQuery {
    #[serde(alias = "rootPath")]
    pub root_path: String,
    pub pattern: String,
    #[serde(alias = "maxResults")]
    pub max_results: Option<usize>,
}

/// Search files
pub async fn search_files(
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, impl IntoResponse> {
    match filesystem::search_files(query.root_path, query.pattern, query.max_results).await {
        Ok(results) => Ok(Json(results)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Query params for metadata endpoint
#[derive(Deserialize)]
pub struct MetadataQuery {
    pub path: String,
}

/// Get file/directory metadata
pub async fn get_metadata(
    Query(query): Query<MetadataQuery>,
) -> Result<Json<FileSystemEntry>, impl IntoResponse> {
    match filesystem::get_file_metadata(query.path).await {
        Ok(entry) => Ok(Json(entry)),
        Err(e) => Err(error_response(StatusCode::NOT_FOUND, e)),
    }
}

/// Default path response
#[derive(Serialize)]
pub struct DefaultPathResponse {
    pub path: String,
}

/// Get default file browser path
pub async fn get_default_path() -> Result<Json<DefaultPathResponse>, impl IntoResponse> {
    match filesystem::get_file_browser_default_path().await {
        Ok(path) => Ok(Json(DefaultPathResponse { path })),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Create file request body
#[derive(Deserialize)]
pub struct CreateFileRequest {
    pub path: String,
}

/// Create a new file
pub async fn create_file(
    Json(req): Json<CreateFileRequest>,
) -> Result<Json<FileSystemEntry>, impl IntoResponse> {
    match filesystem::create_file(req.path).await {
        Ok(entry) => Ok(Json(entry)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Create a new directory
pub async fn create_directory(
    Json(req): Json<CreateFileRequest>,
) -> Result<Json<FileSystemEntry>, impl IntoResponse> {
    match filesystem::create_directory(req.path).await {
        Ok(entry) => Ok(Json(entry)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete request body
#[derive(Deserialize)]
pub struct DeleteRequest {
    pub path: String,
    pub recursive: Option<bool>,
}

/// Delete a file
pub async fn delete_file(
    Json(req): Json<DeleteRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match filesystem::delete_file(req.path).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete a directory
pub async fn delete_directory(
    Json(req): Json<DeleteRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match filesystem::delete_directory(req.path, req.recursive).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Rename request body
#[derive(Deserialize)]
pub struct RenameRequest {
    #[serde(alias = "oldPath")]
    pub old_path: String,
    #[serde(alias = "newPath")]
    pub new_path: String,
}

/// Rename/move a file or directory
pub async fn rename_file(
    Json(req): Json<RenameRequest>,
) -> Result<Json<FileSystemEntry>, impl IntoResponse> {
    match filesystem::rename_file(req.old_path, req.new_path).await {
        Ok(entry) => Ok(Json(entry)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
