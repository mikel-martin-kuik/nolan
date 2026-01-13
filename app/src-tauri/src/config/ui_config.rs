//! UI Configuration Types and Loader
//!
//! Provides configurable UI metadata (status labels, colors, etc.) that can be
//! customized via ~/.nolan/config.yaml. Falls back to defaults if file doesn't exist.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Status configuration with label and color
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusConfig {
    pub value: String,
    pub label: String,
    pub color: String,
}

/// Pipeline stage configuration with icon
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStageConfig {
    pub value: String,
    pub label: String,
    pub icon: String,
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
    pub cron: String,
    pub predefined: String,
}

impl Default for SessionPrefixConfig {
    fn default() -> Self {
        SessionPrefixConfig {
            team: "agent-".to_string(),
            cron: "cron-".to_string(),
            predefined: "pred-".to_string(),
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

/// Root UI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIConfig {
    pub project_statuses: Vec<StatusConfig>,
    pub workflow_statuses: Vec<StatusConfig>,
    pub pipeline_stages: Vec<PipelineStageConfig>,
    pub pipeline_statuses: Vec<StatusConfig>,
    pub feature_request_statuses: Vec<StatusConfig>,
    pub idea_statuses: Vec<StatusConfig>,
    pub idea_review_statuses: Vec<StatusConfig>,
    pub idea_complexity_levels: Vec<StatusConfig>,
    pub decision_statuses: Vec<StatusConfig>,
    pub agent_display_names: Vec<AgentDisplayName>,
    pub session_prefixes: SessionPrefixConfig,
    pub ollama_defaults: OllamaDefaults,
}

impl Default for UIConfig {
    fn default() -> Self {
        UIConfig {
            project_statuses: vec![
                StatusConfig { value: "inprogress".into(), label: "In Progress".into(), color: "text-blue-500".into() },
                StatusConfig { value: "pending".into(), label: "Pending".into(), color: "text-yellow-500".into() },
                StatusConfig { value: "delegated".into(), label: "Delegated".into(), color: "text-purple-500".into() },
                StatusConfig { value: "complete".into(), label: "Complete".into(), color: "text-green-500".into() },
                StatusConfig { value: "archived".into(), label: "Archived".into(), color: "text-muted-foreground".into() },
            ],
            workflow_statuses: vec![
                StatusConfig { value: "offline".into(), label: "Offline".into(), color: "bg-muted-foreground/40".into() },
                StatusConfig { value: "idle".into(), label: "Idle".into(), color: "bg-zinc-500".into() },
                StatusConfig { value: "working".into(), label: "Working".into(), color: "bg-green-500".into() },
                StatusConfig { value: "waiting_input".into(), label: "Needs Input".into(), color: "bg-yellow-500".into() },
                StatusConfig { value: "blocked".into(), label: "Blocked".into(), color: "bg-red-500".into() },
                StatusConfig { value: "ready".into(), label: "Ready".into(), color: "bg-blue-500".into() },
                StatusConfig { value: "complete".into(), label: "Complete".into(), color: "bg-teal-500".into() },
            ],
            pipeline_stages: vec![
                PipelineStageConfig { value: "idea".into(), label: "Idea".into(), icon: "Lightbulb".into() },
                PipelineStageConfig { value: "implementer".into(), label: "Implementation".into(), icon: "Code".into() },
                PipelineStageConfig { value: "analyzer".into(), label: "Analysis".into(), icon: "Search".into() },
                PipelineStageConfig { value: "qa".into(), label: "QA".into(), icon: "TestTube".into() },
                PipelineStageConfig { value: "merger".into(), label: "Merge".into(), icon: "GitMerge".into() },
            ],
            pipeline_statuses: vec![
                StatusConfig { value: "pending".into(), label: "Pending".into(), color: "text-gray-400".into() },
                StatusConfig { value: "running".into(), label: "Running".into(), color: "text-blue-500".into() },
                StatusConfig { value: "success".into(), label: "Success".into(), color: "text-green-500".into() },
                StatusConfig { value: "failed".into(), label: "Failed".into(), color: "text-red-500".into() },
                StatusConfig { value: "skipped".into(), label: "Skipped".into(), color: "text-gray-300".into() },
            ],
            feature_request_statuses: vec![
                StatusConfig { value: "new".into(), label: "New".into(), color: "bg-blue-500/10 text-blue-500 border-blue-500/20".into() },
                StatusConfig { value: "reviewed".into(), label: "Reviewed".into(), color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20".into() },
                StatusConfig { value: "designed".into(), label: "Designed".into(), color: "bg-purple-500/10 text-purple-500 border-purple-500/20".into() },
                StatusConfig { value: "done".into(), label: "Done".into(), color: "bg-green-500/10 text-green-500 border-green-500/20".into() },
                StatusConfig { value: "rejected".into(), label: "Rejected".into(), color: "bg-red-500/10 text-red-500 border-red-500/20".into() },
            ],
            idea_statuses: vec![
                StatusConfig { value: "active".into(), label: "Active".into(), color: "text-green-500".into() },
                StatusConfig { value: "archived".into(), label: "Archived".into(), color: "text-muted-foreground".into() },
            ],
            idea_review_statuses: vec![
                StatusConfig { value: "draft".into(), label: "Draft Proposal".into(), color: "bg-slate-500/10 text-slate-500 border-slate-500/20".into() },
                StatusConfig { value: "needs_input".into(), label: "Needs Your Input".into(), color: "bg-amber-500/10 text-amber-500 border-amber-500/20".into() },
                StatusConfig { value: "ready".into(), label: "Ready".into(), color: "bg-green-500/10 text-green-500 border-green-500/20".into() },
                StatusConfig { value: "rejected".into(), label: "Not Feasible".into(), color: "bg-red-500/10 text-red-500 border-red-500/20".into() },
            ],
            idea_complexity_levels: vec![
                StatusConfig { value: "low".into(), label: "Low".into(), color: "text-green-500".into() },
                StatusConfig { value: "medium".into(), label: "Medium".into(), color: "text-yellow-500".into() },
                StatusConfig { value: "high".into(), label: "High".into(), color: "text-red-500".into() },
            ],
            decision_statuses: vec![
                StatusConfig { value: "proposed".into(), label: "Proposed".into(), color: "bg-blue-500/10 text-blue-500 border-blue-500/20".into() },
                StatusConfig { value: "in_review".into(), label: "In Review".into(), color: "bg-amber-500/10 text-amber-500 border-amber-500/20".into() },
                StatusConfig { value: "approved".into(), label: "Approved".into(), color: "bg-green-500/10 text-green-500 border-green-500/20".into() },
                StatusConfig { value: "deprecated".into(), label: "Deprecated".into(), color: "bg-slate-500/10 text-slate-500 border-slate-500/20".into() },
                StatusConfig { value: "superseded".into(), label: "Superseded".into(), color: "bg-purple-500/10 text-purple-500 border-purple-500/20".into() },
            ],
            agent_display_names: vec![
                "Nova", "Echo", "Pixel", "Flux", "Spark", "Cipher", "Orbit", "Pulse",
                "Zen", "Neon", "Apex", "Qubit", "Atlas", "Vega", "Cosmo", "Drift",
                "Glitch", "Helix", "Ion", "Jade", "Kira", "Luna", "Nebula", "Onyx",
                "Phoenix", "Quantum", "Rune", "Sage", "Terra", "Unity", "Volt", "Warp",
            ].iter().map(|&n| AgentDisplayName { name: n.into() }).collect(),
            session_prefixes: SessionPrefixConfig::default(),
            ollama_defaults: OllamaDefaults::default(),
        }
    }
}

/// Get the config file path (~/.nolan/config.yaml)
fn get_config_path() -> Result<PathBuf, String> {
    let nolan_root = crate::constants::get_nolan_root()?;
    Ok(PathBuf::from(nolan_root).join("config.yaml"))
}

/// Load UI configuration from file, returning defaults if file doesn't exist
pub fn load_ui_config() -> Result<UIConfig, String> {
    let path = get_config_path()?;

    if !path.exists() {
        return Ok(UIConfig::default());
    }

    // Size limit (DoS protection)
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read config metadata: {}", e))?;
    if metadata.len() > 1_048_576 {
        return Err("Config file exceeds 1MB limit".into());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse config YAML: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = UIConfig::default();
        assert_eq!(config.project_statuses.len(), 5);
        assert_eq!(config.workflow_statuses.len(), 7);
        assert_eq!(config.pipeline_stages.len(), 5);
        assert_eq!(config.agent_display_names.len(), 32);
    }

    #[test]
    fn test_session_prefixes_default() {
        let prefixes = SessionPrefixConfig::default();
        assert_eq!(prefixes.team, "agent-");
        assert_eq!(prefixes.cron, "cron-");
        assert_eq!(prefixes.predefined, "pred-");
    }
}
