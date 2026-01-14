//! CLI Provider abstraction for multi-backend agent support
//!
//! This module provides a pluggable CLI provider system that allows Nolan agents
//! to run on Claude Code, OpenCode, or other AI coding assistants interchangeably.
//!
//! # Provider Selection
//! - Per-agent configuration via `cli_provider` field in agent.yaml
//! - System-wide default: Claude Code
//! - Fallback behavior: fallback-to-default when configured provider unavailable
//!
//! # Supported Providers
//! - `claude` (default): Claude Code CLI
//! - `opencode`: OpenCode CLI (open-source, multi-provider support)

mod claude;
mod opencode;
mod types;

pub use claude::ClaudeCodeProvider;
pub use opencode::OpenCodeProvider;
pub use types::*;

/// Get the appropriate CLI provider based on configuration
///
/// # Arguments
/// * `provider_name` - The provider name ("claude", "opencode", or None for default)
/// * `fallback_enabled` - Whether to fall back to default if provider unavailable
///
/// # Returns
/// A boxed CLI provider implementation
pub fn get_provider(provider_name: Option<&str>, fallback_enabled: bool) -> Box<dyn CliProvider> {
    let name = provider_name.unwrap_or("claude");

    match name {
        "opencode" => {
            if OpenCodeProvider::is_available() {
                Box::new(OpenCodeProvider::new())
            } else if fallback_enabled {
                eprintln!("[CLI Provider] OpenCode not available, falling back to Claude Code");
                Box::new(ClaudeCodeProvider::new())
            } else {
                panic!("OpenCode CLI provider requested but not available");
            }
        }
        "claude" | _ => {
            if ClaudeCodeProvider::is_available() {
                Box::new(ClaudeCodeProvider::new())
            } else if fallback_enabled && name != "claude" && OpenCodeProvider::is_available() {
                eprintln!("[CLI Provider] Claude Code not available, falling back to OpenCode");
                Box::new(OpenCodeProvider::new())
            } else {
                // Claude Code is the default, use it even if validation fails
                // (the command will fail later with a better error message)
                Box::new(ClaudeCodeProvider::new())
            }
        }
    }
}

/// Check if a specific provider is available on the system
pub fn is_provider_available(provider_name: &str) -> bool {
    match provider_name {
        "opencode" => OpenCodeProvider::is_available(),
        "claude" | _ => ClaudeCodeProvider::is_available(),
    }
}

/// Get the default provider name
pub fn default_provider() -> &'static str {
    "claude"
}

/// List all supported provider names
pub fn supported_providers() -> Vec<&'static str> {
    vec!["claude", "opencode"]
}
