//! Agent lifecycle HTTP handlers
//!
//! Note: Status change events are not emitted in HTTP mode.
//! Frontend should poll get_status for updates.

use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
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
        Err(error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            errors.join("; "),
        ))
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
    #[serde(alias = "worktreePath")]
    worktree_path: Option<String>,
}

/// Spawn agent (Ralph only)
pub async fn spawn_agent(
    Json(req): Json<SpawnAgentRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse> {
    match lifecycle_core::spawn_ralph_core(req.model, req.force, req.worktree_path).await {
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

/// Kill all instances - handles both Ralph instances and team sessions
pub async fn kill_all(Json(req): Json<KillAllRequest>) -> Result<Json<String>, impl IntoResponse> {
    // For Ralph, use special kill-all-ralph logic
    if req.agent == "ralph" {
        match kill_all_ralph_instances() {
            Ok(result) => Ok(Json(result)),
            Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
        }
    } else {
        // For team agents, use kill_team_sessions
        match lifecycle_core::kill_team_sessions(&req.team_name) {
            Ok(result) => Ok(Json(result)),
            Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
        }
    }
}

/// Kill all Ralph instances (HTTP version - no event emission)
fn kill_all_ralph_instances() -> Result<String, String> {
    use crate::constants::parse_ralph_session;
    use std::fs;

    let sessions = crate::tmux::session::list_sessions()?;
    let mut killed: Vec<String> = Vec::new();
    let mut cleaned: Vec<String> = Vec::new();

    let agents_dir =
        crate::utils::paths::get_agents_dir().unwrap_or_else(|_| std::path::PathBuf::new());

    // Kill all Ralph sessions
    for session in &sessions {
        if let Some(instance_id) = parse_ralph_session(session) {
            if crate::tmux::session::kill_session(session).is_ok() {
                // Only delete ephemeral directories (where .claude is a symlink)
                let agent_path = agents_dir.join(format!("agent-ralph-{}", instance_id));
                let claude_path = agent_path.join(".claude");
                if agent_path.exists() && claude_path.is_symlink() {
                    let _ = fs::remove_dir_all(&agent_path);
                }
                killed.push(session.to_string());
            }
        }
    }

    // Clean up session labels
    crate::commands::session_labels::clear_all_ralph_labels();

    // Clean up orphaned ephemeral directories
    if agents_dir.exists() {
        if let Ok(entries) = fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("agent-ralph-") && !sessions.contains(&name) {
                    let claude_path = entry.path().join(".claude");
                    if claude_path.is_symlink() {
                        if fs::remove_dir_all(entry.path()).is_ok() {
                            cleaned.push(name);
                        }
                    }
                }
            }
        }
    }

    // Build response
    let mut messages: Vec<String> = Vec::new();
    if !killed.is_empty() {
        messages.push(format!(
            "Killed {} ralph instances: {}",
            killed.len(),
            killed.join(", ")
        ));
    }
    if !cleaned.is_empty() {
        messages.push(format!(
            "Cleaned {} orphaned directories: {}",
            cleaned.len(),
            cleaned.join(", ")
        ));
    }

    if messages.is_empty() {
        Ok("No ralph instances or orphaned directories found".to_string())
    } else {
        Ok(messages.join(". "))
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

/// List session labels - returns all custom session labels
pub async fn list_session_labels(
) -> Result<Json<crate::commands::session_labels::SessionLabelsListResponse>, impl IntoResponse> {
    match crate::commands::session_labels::list_session_labels().await {
        Ok(labels) => Ok(Json(labels)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Recovery response
#[derive(Serialize)]
pub struct RecoveryResponse {
    recovered: Vec<String>,
    errors: Vec<String>,
    summary: String,
}

/// List orphaned sessions that can be recovered
/// Includes both Ralph instances and team agent sessions.
pub async fn list_orphaned_sessions() -> Result<Json<Vec<String>>, impl IntoResponse> {
    let mut sessions = Vec::new();

    // Ralph instances
    match lifecycle_core::find_orphaned_ralph_instances() {
        Ok(instances) => {
            sessions.extend(instances.into_iter().map(|i| i.session));
        }
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }

    // Team sessions
    match lifecycle_core::find_orphaned_team_sessions() {
        Ok(team_sessions) => {
            sessions.extend(team_sessions.into_iter().map(|s| s.session));
        }
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }

    Ok(Json(sessions))
}

/// Recover orphaned sessions
/// Finds agent directories that exist but have no running tmux session,
/// and restarts them with --continue to resume the Claude conversation.
/// Supports both Ralph instances and team agent sessions.
pub async fn recover_sessions() -> Result<Json<RecoveryResponse>, impl IntoResponse> {
    match lifecycle_core::recover_all_sessions().await {
        Ok(result) => {
            let summary = result.summary();
            Ok(Json(RecoveryResponse {
                recovered: result.recovered,
                errors: result.errors,
                summary,
            }))
        }
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}
