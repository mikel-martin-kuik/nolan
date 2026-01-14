//! UI Configuration HTTP handlers

use axum::Json;
use serde::{Deserialize, Serialize};
use crate::config::{load_ui_config, update_ssh_terminal_config, UIConfig, SshTerminalConfig};

/// Get UI configuration
pub async fn get_config() -> Result<Json<UIConfig>, (axum::http::StatusCode, String)> {
    load_ui_config()
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))
}

/// Request body for updating SSH terminal config
#[derive(Debug, Deserialize)]
pub struct UpdateSshTerminalRequest {
    pub base_url: String,
    pub enabled: bool,
}

/// Response for SSH terminal config
#[derive(Debug, Serialize)]
pub struct SshTerminalResponse {
    pub ssh_terminal: SshTerminalConfig,
}

/// Get SSH terminal configuration
pub async fn get_ssh_terminal_config() -> Result<Json<SshTerminalResponse>, (axum::http::StatusCode, String)> {
    let config = load_ui_config()
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(SshTerminalResponse {
        ssh_terminal: config.ssh_terminal,
    }))
}

/// Update SSH terminal configuration
pub async fn update_ssh_terminal(
    Json(payload): Json<UpdateSshTerminalRequest>,
) -> Result<Json<SshTerminalResponse>, (axum::http::StatusCode, String)> {
    update_ssh_terminal_config(payload.base_url.clone(), payload.enabled)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(SshTerminalResponse {
        ssh_terminal: SshTerminalConfig {
            base_url: payload.base_url,
            enabled: payload.enabled,
        },
    }))
}
