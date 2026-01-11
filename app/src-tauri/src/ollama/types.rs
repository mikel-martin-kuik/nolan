//! Ollama API types for requests and responses

use serde::{Deserialize, Serialize};

/// Ollama connection status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub connected: bool,
    pub version: Option<String>,
    pub url: String,
}

/// Request for text generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateRequest {
    pub model: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(default)]
    pub stream: bool,
}

/// Response from text generation (non-streaming)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResponse {
    pub response: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub total_duration: Option<u64>,
    #[serde(default)]
    pub eval_count: Option<u32>,
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Request for chat completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub stream: bool,
}

/// Response from chat completion (non-streaming)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub total_duration: Option<u64>,
    #[serde(default)]
    pub eval_count: Option<u32>,
}

/// Model info from Ollama API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub modified_at: Option<String>,
}

/// Response from /api/tags endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsResponse {
    pub models: Vec<ModelInfo>,
}

/// Ollama version response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionResponse {
    pub version: String,
}
