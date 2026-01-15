//! UI Configuration HTTP handlers

use crate::cli_providers;
use crate::config::{
    get_default_cli_provider, load_ui_config, update_default_cli_provider,
    update_ssh_terminal_config, SshTerminalConfig, UIConfig,
};
use axum::Json;
use serde::{Deserialize, Serialize};

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
pub async fn get_ssh_terminal_config(
) -> Result<Json<SshTerminalResponse>, (axum::http::StatusCode, String)> {
    let config =
        load_ui_config().map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

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

// =============================================================================
// CLI Provider Configuration
// =============================================================================

/// Individual provider status
#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub available: bool,
    pub description: String,
}

/// Response for provider status
#[derive(Debug, Serialize)]
pub struct ProvidersStatusResponse {
    pub providers: Vec<ProviderInfo>,
    pub default_provider: String,
}

/// Get CLI providers status
pub async fn get_providers_status() -> Json<ProvidersStatusResponse> {
    let providers = cli_providers::supported_providers()
        .into_iter()
        .map(|name| {
            let description = match name {
                "claude" => "Claude Code CLI - Anthropic's official AI coding assistant",
                "opencode" => "OpenCode CLI - Open-source, multi-provider coding assistant",
                _ => "Unknown provider",
            };
            ProviderInfo {
                name: name.to_string(),
                available: cli_providers::is_provider_available(name),
                description: description.to_string(),
            }
        })
        .collect();

    Json(ProvidersStatusResponse {
        providers,
        default_provider: get_default_cli_provider(),
    })
}

/// Request body for setting default CLI provider
#[derive(Debug, Deserialize)]
pub struct SetDefaultProviderRequest {
    /// Provider name ("claude" or "opencode"), or null to reset to system default
    pub provider: Option<String>,
}

/// Response for default provider operations
#[derive(Debug, Serialize)]
pub struct DefaultProviderResponse {
    pub default_provider: String,
}

/// Set the default CLI provider for all agents
pub async fn set_default_cli_provider(
    Json(payload): Json<SetDefaultProviderRequest>,
) -> Result<Json<DefaultProviderResponse>, (axum::http::StatusCode, String)> {
    update_default_cli_provider(payload.provider)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e))?;

    Ok(Json(DefaultProviderResponse {
        default_provider: get_default_cli_provider(),
    }))
}
