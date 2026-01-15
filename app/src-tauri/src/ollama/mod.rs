//! Ollama integration for local LLM support
//!
//! Provides a client for communicating with a local or remote Ollama server.
//! All operations are optional - if Ollama is not available, features gracefully degrade.

pub mod types;

use once_cell::sync::Lazy;
use reqwest::Client;
use std::sync::RwLock;
use std::time::Duration;

pub use types::*;

/// Default Ollama server URL
const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

/// Default model to use
const DEFAULT_MODEL: &str = "qwen2.5:1.5b";

/// HTTP client timeout
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Connection check timeout (shorter for status checks)
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Global Ollama configuration
static OLLAMA_CONFIG: Lazy<RwLock<OllamaConfig>> =
    Lazy::new(|| RwLock::new(OllamaConfig::from_env()));

/// Ollama client configuration
#[derive(Debug, Clone)]
pub struct OllamaConfig {
    pub url: String,
    pub model: String,
}

impl OllamaConfig {
    /// Create config from environment variables with fallbacks
    pub fn from_env() -> Self {
        let url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| DEFAULT_OLLAMA_URL.to_string());
        let model = std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
        Self { url, model }
    }
}

/// Get the current Ollama URL
pub fn get_url() -> String {
    OLLAMA_CONFIG
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .url
        .clone()
}

/// Get the current default model
pub fn get_model() -> String {
    OLLAMA_CONFIG
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .model
        .clone()
}

/// Update the Ollama URL
pub fn set_url(url: String) {
    OLLAMA_CONFIG
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .url = url;
}

/// Update the default model
pub fn set_model(model: String) {
    OLLAMA_CONFIG
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .model = model;
}

/// Create a reqwest client for Ollama requests
fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

/// Check if Ollama is available and get version
pub async fn check_connection() -> OllamaStatus {
    let url = get_url();
    let client = match create_client() {
        Ok(c) => c,
        Err(_) => {
            return OllamaStatus {
                connected: false,
                version: None,
                url,
            }
        }
    };

    let version_url = format!("{}/api/version", url);

    match client.get(&version_url).send().await {
        Ok(response) if response.status().is_success() => {
            let version = response
                .json::<VersionResponse>()
                .await
                .ok()
                .map(|v| v.version);
            OllamaStatus {
                connected: true,
                version,
                url,
            }
        }
        _ => OllamaStatus {
            connected: false,
            version: None,
            url,
        },
    }
}

/// List available models from Ollama
pub async fn list_models() -> Result<Vec<String>, String> {
    let url = get_url();
    let client = create_client()?;

    let tags_url = format!("{}/api/tags", url);

    let response = client
        .get(&tags_url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned status: {}", response.status()));
    }

    let models: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    Ok(models.models.into_iter().map(|m| m.name).collect())
}

/// Generate text using Ollama
pub async fn generate(
    model: Option<String>,
    prompt: String,
    system: Option<String>,
) -> Result<String, String> {
    let url = get_url();
    let model = model.unwrap_or_else(get_model);
    let client = create_client()?;

    let generate_url = format!("{}/api/generate", url);

    let request = GenerateRequest {
        model,
        prompt,
        system,
        stream: false,
    };

    let response = client
        .post(&generate_url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({}): {}", status, body));
    }

    let result: GenerateResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse generate response: {}", e))?;

    Ok(result.response)
}

/// Chat with Ollama
pub async fn chat(
    model: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<ChatMessage, String> {
    let url = get_url();
    let model = model.unwrap_or_else(get_model);
    let client = create_client()?;

    let chat_url = format!("{}/api/chat", url);

    let request = ChatRequest {
        model,
        messages,
        stream: false,
    };

    let response = client
        .post(&chat_url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({}): {}", status, body));
    }

    let result: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse chat response: {}", e))?;

    Ok(result.message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = OllamaConfig::from_env();
        // Should have some URL (either from env or default)
        assert!(!config.url.is_empty());
        assert!(!config.model.is_empty());
    }
}
