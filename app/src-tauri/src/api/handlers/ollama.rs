//! Ollama integration HTTP handlers
//!
//! Provides endpoints for checking Ollama status, listing models,
//! and generating text. All endpoints gracefully handle Ollama being unavailable.

use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::ollama;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Get Ollama connection status
pub async fn get_status() -> Json<ollama::OllamaStatus> {
    Json(ollama::check_connection().await)
}

/// List available models
pub async fn list_models() -> Result<Json<Vec<String>>, impl IntoResponse> {
    match ollama::list_models().await {
        Ok(models) => Ok(Json(models)),
        Err(e) => Err(error_response(StatusCode::SERVICE_UNAVAILABLE, e)),
    }
}

/// Generate request body
#[derive(Deserialize)]
pub struct GenerateRequest {
    #[serde(default)]
    pub model: Option<String>,
    pub prompt: String,
    #[serde(default)]
    pub system: Option<String>,
}

/// Generate response
#[derive(Serialize)]
pub struct GenerateResponseBody {
    pub response: String,
}

/// Generate text using Ollama
pub async fn generate(
    Json(req): Json<GenerateRequest>,
) -> Result<Json<GenerateResponseBody>, impl IntoResponse> {
    match ollama::generate(req.model, req.prompt, req.system).await {
        Ok(response) => Ok(Json(GenerateResponseBody { response })),
        Err(e) => Err(error_response(StatusCode::SERVICE_UNAVAILABLE, e)),
    }
}

/// Chat request body
#[derive(Deserialize)]
pub struct ChatRequest {
    #[serde(default)]
    pub model: Option<String>,
    pub messages: Vec<ollama::ChatMessage>,
}

/// Chat response
#[derive(Serialize)]
pub struct ChatResponseBody {
    pub message: ollama::ChatMessage,
}

/// Chat with Ollama
pub async fn chat(
    Json(req): Json<ChatRequest>,
) -> Result<Json<ChatResponseBody>, impl IntoResponse> {
    match ollama::chat(req.model, req.messages).await {
        Ok(message) => Ok(Json(ChatResponseBody { message })),
        Err(e) => Err(error_response(StatusCode::SERVICE_UNAVAILABLE, e)),
    }
}

/// Config update request
#[derive(Deserialize)]
pub struct ConfigRequest {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// Config response
#[derive(Serialize)]
pub struct ConfigResponse {
    pub url: String,
    pub model: String,
}

/// Get current Ollama config
pub async fn get_config() -> Json<ConfigResponse> {
    Json(ConfigResponse {
        url: ollama::get_url(),
        model: ollama::get_model(),
    })
}

/// Update Ollama config
pub async fn update_config(
    Json(req): Json<ConfigRequest>,
) -> Json<ConfigResponse> {
    if let Some(url) = req.url {
        ollama::set_url(url);
    }
    if let Some(model) = req.model {
        ollama::set_model(model);
    }
    Json(ConfigResponse {
        url: ollama::get_url(),
        model: ollama::get_model(),
    })
}
