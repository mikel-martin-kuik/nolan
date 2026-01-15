//! Types and traits for CLI provider abstraction

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Configuration for spawning a CLI agent
#[derive(Clone, Debug)]
pub struct CliSpawnConfig {
    /// The prompt/instructions to send to the agent
    pub prompt: String,
    /// Model to use (provider-agnostic name like "opus", "sonnet", "haiku")
    pub model: String,
    /// Working directory for the agent
    pub working_dir: PathBuf,
    /// Session ID for resume capability
    pub session_id: Option<String>,
    /// Whether to resume an existing session
    pub resume: bool,
    /// Output format preference
    pub output_format: OutputFormat,
    /// Allowed tools (for guardrails)
    pub allowed_tools: Vec<String>,
    /// Additional system prompt content (for guardrails)
    pub system_prompt_append: Option<String>,
    /// Whether to skip permission prompts
    pub skip_permissions: bool,
    /// Verbose output
    pub verbose: bool,
    /// Environment variables to set
    pub env_vars: HashMap<String, String>,
}

impl Default for CliSpawnConfig {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            model: "sonnet".to_string(),
            working_dir: PathBuf::from("."),
            session_id: None,
            resume: false,
            output_format: OutputFormat::StreamJson,
            allowed_tools: Vec::new(),
            system_prompt_append: None,
            skip_permissions: true,
            verbose: true,
            env_vars: HashMap::new(),
        }
    }
}

/// Output format for CLI agent
#[derive(Clone, Debug, Default)]
pub enum OutputFormat {
    #[default]
    StreamJson,
    Json,
    Text,
}

/// Result from parsing CLI output
#[derive(Clone, Debug, Default)]
pub struct CliResult {
    /// Exit code of the CLI process
    pub exit_code: Option<i32>,
    /// Total cost in USD (if available)
    pub total_cost_usd: Option<f32>,
    /// Session ID (for resume)
    pub session_id: Option<String>,
}

/// Trait for CLI provider implementations
///
/// Each provider (Claude Code, OpenCode, etc.) implements this trait
/// to provide consistent agent spawning and management.
pub trait CliProvider: Send + Sync {
    /// Get the provider name
    fn name(&self) -> &'static str;

    /// Check if this provider is available on the system
    fn is_available() -> bool
    where
        Self: Sized;

    /// Get the CLI executable command
    fn executable(&self) -> &str;

    /// Map a generic model name to provider-specific model identifier
    ///
    /// # Arguments
    /// * `model` - Generic model name (e.g., "opus", "sonnet", "haiku")
    ///
    /// # Returns
    /// Provider-specific model identifier
    fn map_model(&self, model: &str) -> String;

    /// Build the full shell command for spawning an agent
    ///
    /// # Arguments
    /// * `config` - Spawn configuration
    ///
    /// # Returns
    /// The shell command string to execute
    fn build_command(&self, config: &CliSpawnConfig) -> String;

    /// Build CLI arguments (for direct Command building, not shell string)
    ///
    /// # Arguments
    /// * `config` - Spawn configuration
    ///
    /// # Returns
    /// Vector of CLI arguments
    fn build_args(&self, config: &CliSpawnConfig) -> Vec<String>;

    /// Parse the output log file to extract results
    ///
    /// # Arguments
    /// * `log_path` - Path to the output log file
    ///
    /// # Returns
    /// Parsed CLI result
    fn parse_output(&self, log_path: &str) -> CliResult;

    /// Get the output format flag for this provider
    fn output_format_flag(&self, format: &OutputFormat) -> Vec<String>;

    /// Check if this provider supports session resume
    fn supports_resume(&self) -> bool;

    /// Get the session resume flag
    fn resume_flag(&self) -> &str;

    /// Get the session ID flag
    fn session_id_flag(&self) -> &str;
}

/// CLI provider configuration (stored in agent.yaml)
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CliProviderType {
    #[default]
    Claude,
    Opencode,
}

impl CliProviderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CliProviderType::Claude => "claude",
            CliProviderType::Opencode => "opencode",
        }
    }
}

impl From<&str> for CliProviderType {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "opencode" => CliProviderType::Opencode,
            _ => CliProviderType::Claude,
        }
    }
}
