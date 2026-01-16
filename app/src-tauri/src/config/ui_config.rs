//! UI Configuration Types and Loader
//!
//! Provides configurable UI metadata (status labels, colors, etc.) that can be
//! customized via ~/.nolan/config.yaml. Falls back to defaults if file doesn't exist.
//!
//! Environment Variable Overrides:
//! - OLLAMA_URL: Override ollama_defaults.url
//! - OLLAMA_MODEL: Override ollama_defaults.model
//! - NOLAN_API_PORT: Expose API port to frontend
//! - NOLAN_ROOT: Expose Nolan root directory to frontend

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

/// Status configuration with label and color
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusConfig {
    pub value: String,
    pub label: String,
    pub color: String,
}

/// Agent display name entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDisplayName {
    pub name: String,
}

/// Session prefix configuration for agent filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPrefixConfig {
    pub team: String,
    /// No longer used - agents are identified by config, not prefix
    #[serde(alias = "cron")]
    pub scheduled: String,
    pub predefined: String,
}

impl Default for SessionPrefixConfig {
    fn default() -> Self {
        SessionPrefixConfig {
            team: "agent-".to_string(),
            scheduled: "".to_string(),
            predefined: "".to_string(), // No longer using prefixes for predefined agents
        }
    }
}

/// Ollama default configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaDefaults {
    pub url: String,
    pub model: String,
}

impl Default for OllamaDefaults {
    fn default() -> Self {
        OllamaDefaults {
            url: "http://localhost:11434".to_string(),
            model: "qwen2.5:1.5b".to_string(),
        }
    }
}

impl OllamaDefaults {
    /// Apply environment variable overrides
    pub fn with_env_overrides(mut self) -> Self {
        if let Ok(url) = env::var("OLLAMA_URL") {
            self.url = url;
        }
        if let Ok(model) = env::var("OLLAMA_MODEL") {
            self.model = model;
        }
        self
    }
}

/// Runtime configuration derived from environment variables
/// These values are computed at runtime and exposed to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    /// API server port (from NOLAN_API_PORT, default 3030)
    pub api_port: u16,
    /// Nolan root directory (from NOLAN_ROOT)
    pub nolan_root: String,
    /// Role file name for agents (e.g., "CLAUDE.md")
    pub role_filename: String,
    /// Team config file name (e.g., "team.yaml")
    pub team_filename: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        RuntimeConfig {
            api_port: 3030,
            nolan_root: String::new(),
            role_filename: "CLAUDE.md".to_string(),
            team_filename: "team.yaml".to_string(),
        }
    }
}

impl RuntimeConfig {
    /// Build runtime config from environment variables
    pub fn from_env() -> Self {
        let api_port = env::var("NOLAN_API_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3030);

        let nolan_root = env::var("NOLAN_ROOT").unwrap_or_else(|_| {
            // Fallback to ~/.nolan
            dirs::home_dir()
                .map(|h| h.join(".nolan").to_string_lossy().to_string())
                .unwrap_or_default()
        });

        RuntimeConfig {
            api_port,
            nolan_root,
            role_filename: "CLAUDE.md".to_string(),
            team_filename: "team.yaml".to_string(),
        }
    }
}

/// SSH terminal configuration for web-based terminal access
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshTerminalConfig {
    /// Base URL for the SSH web terminal (e.g., wetty, gotty, or Guacamole)
    pub base_url: String,
    /// Whether SSH terminal is enabled
    pub enabled: bool,
}

impl Default for SshTerminalConfig {
    fn default() -> Self {
        SshTerminalConfig {
            base_url: String::new(),
            enabled: false,
        }
    }
}

/// Pipeline configuration for workflow files
/// Defines the raw input file (prompt) and structured spec file (entrypoint)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PipelineConfig {
    /// Raw user input file - only fed to starter (Layer 1) agents (default: "prompt.md")
    #[serde(default)]
    pub prompt_file: String,
    /// Structured specification file - fed to structured (Layer 2) agents (default: "SPEC.md")
    #[serde(default)]
    pub entrypoint_file: String,
}

/// Trigger configuration for the Layer 1 entry point
/// Pipeline stage agents (implementer, analyzer, merger) are now configured
/// in the pipeline definition (Builder > Pipelines tab)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TriggerConfig {
    /// Agent name for processing ideas (default: "idea-processor")
    /// This is the Layer 1 entry point that processes raw ideas into structured proposals
    #[serde(default)]
    pub idea_processor: Option<String>,

    // Legacy fields - kept for backwards compatibility with existing configs
    // These are now configured per-pipeline in the pipeline definition
    #[serde(default, skip_serializing)]
    pub idea_implementer: Option<String>,
    #[serde(default, skip_serializing)]
    pub implementer_analyzer: Option<String>,
    #[serde(default, skip_serializing)]
    pub idea_merger: Option<String>,
}

impl TriggerConfig {
    /// Get idea processor agent name with fallback to default
    pub fn get_idea_processor(&self) -> String {
        self.idea_processor
            .clone()
            .unwrap_or_else(|| "idea-processor".to_string())
    }
}

/// Root UI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIConfig {
    pub project_statuses: Vec<StatusConfig>,
    pub workflow_statuses: Vec<StatusConfig>,
    pub feature_request_statuses: Vec<StatusConfig>,
    pub idea_statuses: Vec<StatusConfig>,
    pub idea_review_statuses: Vec<StatusConfig>,
    pub idea_complexity_levels: Vec<StatusConfig>,
    pub decision_statuses: Vec<StatusConfig>,
    pub agent_display_names: Vec<AgentDisplayName>,
    pub session_prefixes: SessionPrefixConfig,
    pub ollama_defaults: OllamaDefaults,
    /// Runtime configuration derived from environment variables
    #[serde(default)]
    pub runtime: RuntimeConfig,
    #[serde(default)]
    pub ssh_terminal: SshTerminalConfig,
    /// Pipeline configuration for workflow entrypoint
    #[serde(default)]
    pub pipeline: PipelineConfig,
    /// Default CLI provider for all agents (when not specified per-agent)
    /// Options: "claude", "opencode"
    #[serde(default)]
    pub default_cli_provider: Option<String>,
    /// Trigger configuration for mapping triggers to agents
    #[serde(default)]
    pub trigger_configs: TriggerConfig,
}

impl Default for UIConfig {
    fn default() -> Self {
        UIConfig {
            project_statuses: vec![
                StatusConfig {
                    value: "inprogress".into(),
                    label: "In Progress".into(),
                    color: "text-blue-500".into(),
                },
                StatusConfig {
                    value: "pending".into(),
                    label: "Pending".into(),
                    color: "text-yellow-500".into(),
                },
                StatusConfig {
                    value: "delegated".into(),
                    label: "Delegated".into(),
                    color: "text-purple-500".into(),
                },
                StatusConfig {
                    value: "complete".into(),
                    label: "Complete".into(),
                    color: "text-green-500".into(),
                },
                StatusConfig {
                    value: "archived".into(),
                    label: "Archived".into(),
                    color: "text-muted-foreground".into(),
                },
            ],
            workflow_statuses: vec![
                StatusConfig {
                    value: "offline".into(),
                    label: "Offline".into(),
                    color: "bg-muted-foreground/40".into(),
                },
                StatusConfig {
                    value: "idle".into(),
                    label: "Idle".into(),
                    color: "bg-zinc-500".into(),
                },
                StatusConfig {
                    value: "working".into(),
                    label: "Working".into(),
                    color: "bg-green-500".into(),
                },
                StatusConfig {
                    value: "waiting_input".into(),
                    label: "Needs Input".into(),
                    color: "bg-yellow-500".into(),
                },
                StatusConfig {
                    value: "blocked".into(),
                    label: "Blocked".into(),
                    color: "bg-red-500".into(),
                },
                StatusConfig {
                    value: "ready".into(),
                    label: "Ready".into(),
                    color: "bg-blue-500".into(),
                },
                StatusConfig {
                    value: "complete".into(),
                    label: "Complete".into(),
                    color: "bg-teal-500".into(),
                },
            ],
            feature_request_statuses: vec![
                StatusConfig {
                    value: "new".into(),
                    label: "New".into(),
                    color: "bg-blue-500/10 text-blue-500 border-blue-500/20".into(),
                },
                StatusConfig {
                    value: "reviewed".into(),
                    label: "Reviewed".into(),
                    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20".into(),
                },
                StatusConfig {
                    value: "designed".into(),
                    label: "Designed".into(),
                    color: "bg-purple-500/10 text-purple-500 border-purple-500/20".into(),
                },
                StatusConfig {
                    value: "done".into(),
                    label: "Done".into(),
                    color: "bg-green-500/10 text-green-500 border-green-500/20".into(),
                },
                StatusConfig {
                    value: "rejected".into(),
                    label: "Rejected".into(),
                    color: "bg-red-500/10 text-red-500 border-red-500/20".into(),
                },
            ],
            idea_statuses: vec![
                StatusConfig {
                    value: "active".into(),
                    label: "Active".into(),
                    color: "text-green-500".into(),
                },
                StatusConfig {
                    value: "archived".into(),
                    label: "Archived".into(),
                    color: "text-muted-foreground".into(),
                },
            ],
            idea_review_statuses: vec![
                StatusConfig {
                    value: "draft".into(),
                    label: "Draft Proposal".into(),
                    color: "bg-slate-500/10 text-slate-500 border-slate-500/20".into(),
                },
                StatusConfig {
                    value: "needs_input".into(),
                    label: "Needs Your Input".into(),
                    color: "bg-amber-500/10 text-amber-500 border-amber-500/20".into(),
                },
                StatusConfig {
                    value: "ready".into(),
                    label: "Ready".into(),
                    color: "bg-green-500/10 text-green-500 border-green-500/20".into(),
                },
                StatusConfig {
                    value: "rejected".into(),
                    label: "Not Feasible".into(),
                    color: "bg-red-500/10 text-red-500 border-red-500/20".into(),
                },
            ],
            idea_complexity_levels: vec![
                StatusConfig {
                    value: "low".into(),
                    label: "Low".into(),
                    color: "text-green-500".into(),
                },
                StatusConfig {
                    value: "medium".into(),
                    label: "Medium".into(),
                    color: "text-yellow-500".into(),
                },
                StatusConfig {
                    value: "high".into(),
                    label: "High".into(),
                    color: "text-red-500".into(),
                },
            ],
            decision_statuses: vec![
                StatusConfig {
                    value: "proposed".into(),
                    label: "Proposed".into(),
                    color: "bg-blue-500/10 text-blue-500 border-blue-500/20".into(),
                },
                StatusConfig {
                    value: "in_review".into(),
                    label: "In Review".into(),
                    color: "bg-amber-500/10 text-amber-500 border-amber-500/20".into(),
                },
                StatusConfig {
                    value: "approved".into(),
                    label: "Approved".into(),
                    color: "bg-green-500/10 text-green-500 border-green-500/20".into(),
                },
                StatusConfig {
                    value: "deprecated".into(),
                    label: "Deprecated".into(),
                    color: "bg-slate-500/10 text-slate-500 border-slate-500/20".into(),
                },
                StatusConfig {
                    value: "superseded".into(),
                    label: "Superseded".into(),
                    color: "bg-purple-500/10 text-purple-500 border-purple-500/20".into(),
                },
            ],
            agent_display_names: vec![
                "Nova", "Echo", "Pixel", "Flux", "Spark", "Cipher", "Orbit", "Pulse", "Zen",
                "Neon", "Apex", "Qubit", "Atlas", "Vega", "Cosmo", "Drift", "Glitch", "Helix",
                "Ion", "Jade", "Kira", "Luna", "Nebula", "Onyx", "Phoenix", "Quantum", "Rune",
                "Sage", "Terra", "Unity", "Volt", "Warp",
            ]
            .iter()
            .map(|&n| AgentDisplayName { name: n.into() })
            .collect(),
            session_prefixes: SessionPrefixConfig::default(),
            ollama_defaults: OllamaDefaults::default(),
            runtime: RuntimeConfig::default(),
            ssh_terminal: SshTerminalConfig::default(),
            pipeline: PipelineConfig::default(),
            default_cli_provider: None,
            trigger_configs: TriggerConfig::default(),
        }
    }
}

/// Get the config file path (~/.nolan/config/nolan.yaml)
fn get_config_path() -> Result<PathBuf, String> {
    crate::utils::paths::get_config_file_path()
}

/// Update SSH terminal configuration in config file
/// Preserves other config values, only updates ssh_terminal section
pub fn update_ssh_terminal_config(base_url: String, enabled: bool) -> Result<(), String> {
    let path = get_config_path()?;

    // Load existing config
    let mut config = if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_yaml::from_str::<UIConfig>(&content).unwrap_or_else(|_| UIConfig::default())
    } else {
        UIConfig::default()
    };

    // Update SSH terminal config
    config.ssh_terminal = SshTerminalConfig { base_url, enabled };

    // Write back to file
    let yaml_content =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, yaml_content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Update the default CLI provider in config file
/// Preserves other config values, only updates default_cli_provider field
pub fn update_default_cli_provider(provider: Option<String>) -> Result<(), String> {
    let path = get_config_path()?;

    // Validate provider if specified
    if let Some(ref p) = provider {
        let valid_providers = ["claude", "opencode"];
        if !valid_providers.contains(&p.as_str()) {
            return Err(format!(
                "Invalid CLI provider '{}'. Valid options: {}",
                p,
                valid_providers.join(", ")
            ));
        }
    }

    // Load existing config
    let mut config = if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_yaml::from_str::<UIConfig>(&content).unwrap_or_else(|_| UIConfig::default())
    } else {
        UIConfig::default()
    };

    // Update default CLI provider
    config.default_cli_provider = provider;

    // Write back to file
    let yaml_content =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, yaml_content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Get the effective default CLI provider
/// Returns the configured default, or "claude" if not configured
pub fn get_default_cli_provider() -> String {
    match load_ui_config() {
        Ok(config) => {
            let provider = config
                .default_cli_provider
                .unwrap_or_else(|| "claude".to_string());
            eprintln!("[Config] get_default_cli_provider() -> {}", provider);
            provider
        }
        Err(e) => {
            eprintln!(
                "[Config] get_default_cli_provider() error: {}, defaulting to claude",
                e
            );
            "claude".to_string()
        }
    }
}

/// Get the pipeline entrypoint filename from config (SPEC.md by default)
/// This is the structured specification file fed to Layer 2 (structured) agents
pub fn get_pipeline_entrypoint_file() -> String {
    load_ui_config()
        .map(|config| config.pipeline.entrypoint_file)
        .unwrap_or_else(|_| "SPEC.md".to_string())
}

/// Get the prompt filename from config (prompt.md by default)
/// This is the raw user input file fed only to Layer 1 (starter) agents
pub fn get_prompt_file() -> String {
    load_ui_config()
        .map(|config| config.pipeline.prompt_file)
        .unwrap_or_else(|_| "prompt.md".to_string())
}

/// Get trigger configuration from config
/// Returns the trigger configs with defaults applied
pub fn get_trigger_config() -> TriggerConfig {
    load_ui_config()
        .map(|config| config.trigger_configs)
        .unwrap_or_default()
}

/// Get the configured idea processor agent name
pub fn get_idea_processor_agent() -> String {
    get_trigger_config().get_idea_processor()
}

/// Update trigger configuration in config file
/// Preserves other config values, only updates trigger_configs section
pub fn update_trigger_config(trigger_config: TriggerConfig) -> Result<(), String> {
    let path = get_config_path()?;

    // Load existing config
    let mut config = if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_yaml::from_str::<UIConfig>(&content).unwrap_or_else(|_| UIConfig::default())
    } else {
        UIConfig::default()
    };

    // Update trigger config
    config.trigger_configs = trigger_config;

    // Write back to file
    let yaml_content =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, yaml_content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Load UI configuration from file, returning defaults if file doesn't exist
/// Environment variables override config file values:
/// - OLLAMA_URL: Override ollama_defaults.url
/// - OLLAMA_MODEL: Override ollama_defaults.model
/// - NOLAN_API_PORT: Set runtime.api_port
/// - NOLAN_ROOT: Set runtime.nolan_root
pub fn load_ui_config() -> Result<UIConfig, String> {
    let path = get_config_path()?;

    let mut config = if !path.exists() {
        UIConfig::default()
    } else {
        // Size limit (DoS protection)
        let metadata =
            fs::metadata(&path).map_err(|e| format!("Failed to read config metadata: {}", e))?;
        if metadata.len() > 1_048_576 {
            return Err("Config file exceeds 1MB limit".into());
        }

        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;

        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse config YAML: {}", e))?
    };

    // Apply environment variable overrides
    config.ollama_defaults = config.ollama_defaults.with_env_overrides();
    config.runtime = RuntimeConfig::from_env();

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = UIConfig::default();
        assert_eq!(config.project_statuses.len(), 5);
        assert_eq!(config.workflow_statuses.len(), 7);
        assert_eq!(config.agent_display_names.len(), 32);
    }

    #[test]
    fn test_session_prefixes_default() {
        let prefixes = SessionPrefixConfig::default();
        assert_eq!(prefixes.team, "agent-");
        assert_eq!(prefixes.scheduled, ""); // No longer using prefixes for scheduled agents
        assert_eq!(prefixes.predefined, ""); // No longer using prefixes for predefined agents
    }

    #[test]
    fn test_update_default_cli_provider() {
        // This test requires NOLAN_ROOT to be set
        if std::env::var("NOLAN_ROOT").is_ok() {
            // Test setting provider
            let result = update_default_cli_provider(Some("opencode".to_string()));
            assert!(result.is_ok(), "Failed to update: {:?}", result);

            // Verify it was set
            let default = get_default_cli_provider();
            assert_eq!(default, "opencode");

            // Reset back to claude
            let result = update_default_cli_provider(Some("claude".to_string()));
            assert!(result.is_ok());
        }
    }
}
