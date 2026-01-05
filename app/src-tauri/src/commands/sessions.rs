use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::path::PathBuf;
use crate::services::python_service::PythonService;

// Type definitions matching Pydantic models and TypeScript types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub summary: String,
    pub first_timestamp: String,  // ISO 8601
    pub last_timestamp: String,
    pub message_count: u32,
    pub token_usage: TokenUsage,
    pub cwd: Option<String>,
    pub agents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageContent {
    pub content: String,
    pub r#type: String,  // "type" is keyword
    pub timestamp: Option<String>,
    pub tokens: Option<TokenUsage>,
    pub tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub session: Session,
    pub messages: Vec<MessageContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedSessions {
    pub sessions: Vec<Session>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
    pub has_more: bool,
}

// Path validation helper
fn validate_output_path(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    if !path_buf.is_absolute() {
        return Err("Output path must be absolute".to_string());
    }

    // Validate parent directory exists or can be created
    if let Some(parent) = path_buf.parent() {
        // Check if parent exists - if not, try to create it
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        // Now canonicalize to prevent traversal attacks
        parent.canonicalize()
            .map_err(|e| format!("Path validation failed: {}", e))?;
    } else {
        return Err("Invalid output path".to_string());
    }

    Ok(path_buf)
}

// Tauri commands

#[tauri::command]
pub async fn get_sessions(
    state: State<'_, Arc<Mutex<PythonService>>>,
    project: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<Session>, String> {
    let params = json!({
        "project": project,
        "from_date": from_date,
        "to_date": to_date,
    });

    let mut service = state.lock().await;
    let result = service.call_rpc("get_sessions", params)?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to deserialize: {}", e))
}

#[tauri::command]
pub async fn get_sessions_paginated(
    state: State<'_, Arc<Mutex<PythonService>>>,
    project: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<PaginatedSessions, String> {
    let params = json!({
        "project": project,
        "from_date": from_date,
        "to_date": to_date,
        "limit": limit.unwrap_or(50),
        "offset": offset.unwrap_or(0),
    });

    let mut service = state.lock().await;
    let result = service.call_rpc("get_sessions_paginated", params)?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to deserialize: {}", e))
}

#[tauri::command]
pub async fn get_session_detail(
    state: State<'_, Arc<Mutex<PythonService>>>,
    session_id: String,
) -> Result<SessionDetail, String> {
    let params = json!({
        "session_id": session_id,
    });

    let mut service = state.lock().await;
    let result = service.call_rpc("get_session_detail", params)?;

    serde_json::from_value(result)
        .map_err(|e| format!("Failed to deserialize: {}", e))
}

#[tauri::command]
pub async fn export_session_html(
    state: State<'_, Arc<Mutex<PythonService>>>,
    session_id: String,
    output_path: String,
) -> Result<String, String> {
    let validated_path = validate_output_path(&output_path)?;

    let params = json!({
        "session_id": session_id,
        "output_path": validated_path.to_string_lossy(),
    });

    let mut service = state.lock().await;
    let result = service.call_rpc("export_html", params)?;

    result.get("path")
        .and_then(|p| p.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing path in export response".to_string())
}

#[tauri::command]
pub async fn export_session_markdown(
    state: State<'_, Arc<Mutex<PythonService>>>,
    session_id: String,
    output_path: String,
) -> Result<String, String> {
    let validated_path = validate_output_path(&output_path)?;

    let params = json!({
        "session_id": session_id,
        "output_path": validated_path.to_string_lossy(),
    });

    let mut service = state.lock().await;
    let result = service.call_rpc("export_markdown", params)?;

    result.get("path")
        .and_then(|p| p.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing path in export response".to_string())
}
