//! Tauri commands for Ollama integration

use crate::ollama::{self, ChatMessage, OllamaStatus};

/// Get Ollama connection status
#[tauri::command]
pub async fn ollama_status() -> OllamaStatus {
    ollama::check_connection().await
}

/// List available models
#[tauri::command]
pub async fn ollama_models() -> Result<Vec<String>, String> {
    ollama::list_models().await
}

/// Generate text
#[tauri::command]
pub async fn ollama_generate(
    model: Option<String>,
    prompt: String,
    system: Option<String>,
) -> Result<String, String> {
    ollama::generate(model, prompt, system).await
}

/// Chat with Ollama
#[tauri::command]
pub async fn ollama_chat(
    model: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<ChatMessage, String> {
    ollama::chat(model, messages).await
}

/// Get current config
#[tauri::command]
pub async fn ollama_get_config() -> (String, String) {
    (ollama::get_url(), ollama::get_model())
}

/// Update config
#[tauri::command]
pub async fn ollama_set_config(url: Option<String>, model: Option<String>) -> (String, String) {
    if let Some(u) = url {
        ollama::set_url(u);
    }
    if let Some(m) = model {
        ollama::set_model(m);
    }
    (ollama::get_url(), ollama::get_model())
}
