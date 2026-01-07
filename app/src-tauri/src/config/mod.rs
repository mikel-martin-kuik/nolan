use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Root team configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamConfig {
    pub team: Team,
}

/// Team definition with agents, workflow, and communication settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub name: String,
    pub description: String,
    pub version: String,
    pub agents: Vec<AgentConfig>,
    pub workflow: WorkflowConfig,
    pub communication: CommunicationConfig,
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub name: String,
    pub role: String,
    pub model: String,
    pub color: String,
    pub output_file: Option<String>,
    pub required_sections: Vec<String>,
    pub file_permissions: String,
    pub workflow_participant: bool,
    #[serde(default)]
    pub awaits_qa: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_passes: Option<i32>,
    #[serde(default)]
    pub multi_instance: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_instances: Option<i32>,
    #[serde(default)]
    pub instance_names: Vec<String>,
}

/// Workflow configuration with phases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub coordinator: String,
    pub phases: Vec<PhaseConfig>,
}

/// Individual workflow phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseConfig {
    pub name: String,
    pub owner: String,
    pub output: String,
    pub requires: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
}

/// Communication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunicationConfig {
    pub broadcast_groups: Vec<BroadcastGroup>,
}

/// Broadcast group definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastGroup {
    pub name: String,
    pub pattern: String,
    pub members: Vec<String>,
}

impl TeamConfig {
    /// Load team configuration from YAML file with DoS protection
    ///
    /// Security measures:
    /// - File size limit: 1MB max
    /// - YAML depth checked implicitly by serde_yaml recursion limits
    pub fn load(team_name: &str) -> Result<Self, String> {
        let nolan_root = std::env::var("NOLAN_ROOT")
            .map_err(|_| "NOLAN_ROOT not set".to_string())?;

        let config_path = PathBuf::from(nolan_root)
            .join("teams")
            .join(format!("{}.yaml", team_name));

        if !config_path.exists() {
            return Err(format!("Team config not found: {}", config_path.display()));
        }

        // Check file size (1MB max) - DoS protection
        let metadata = fs::metadata(&config_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;

        if metadata.len() > 1_048_576 {
            return Err(format!("Team config too large: {} bytes (max 1MB)", metadata.len()));
        }

        let contents = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;

        let config: TeamConfig = serde_yaml::from_str(&contents)
            .map_err(|e| format!("Failed to parse YAML: {}", e))?;

        // Note: serde_yaml depth limit is implicitly enforced by recursion limits
        // Additional explicit depth validation can be added if needed

        Ok(config)
    }

    /// Get agent configuration by name
    pub fn get_agent(&self, name: &str) -> Option<&AgentConfig> {
        self.team.agents.iter().find(|a| a.name == name)
    }

    /// Get list of workflow participant agent names
    pub fn workflow_participants(&self) -> Vec<&str> {
        self.team.agents.iter()
            .filter(|a| a.workflow_participant)
            .map(|a| a.name.as_str())
            .collect()
    }

    /// Get all agent names
    pub fn agent_names(&self) -> Vec<&str> {
        self.team.agents.iter()
            .map(|a| a.name.as_str())
            .collect()
    }

    /// Get coordinator agent name
    pub fn coordinator(&self) -> &str {
        &self.team.workflow.coordinator
    }

    /// Check if an agent is a workflow participant
    pub fn is_workflow_participant(&self, agent_name: &str) -> bool {
        self.team.agents.iter()
            .any(|a| a.name == agent_name && a.workflow_participant)
    }

    /// Get model for specific agent
    pub fn get_agent_model(&self, agent_name: &str) -> Option<&str> {
        self.get_agent(agent_name)
            .map(|a| a.model.as_str())
    }
}

/// Load team configuration for a specific project
///
/// Reads .team file from project directory, or defaults to "default" team
pub fn load_project_team(project_path: &Path) -> Result<TeamConfig, String> {
    let team_file = project_path.join(".team");
    let team_name = if team_file.exists() {
        fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read .team file: {}", e))?
            .trim()
            .to_string()
    } else {
        "default".to_string()
    };
    TeamConfig::load(&team_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_default_team() {
        // This test requires NOLAN_ROOT to be set
        if std::env::var("NOLAN_ROOT").is_ok() {
            let config = TeamConfig::load("default");
            assert!(config.is_ok(), "Failed to load default team config");

            let config = config.unwrap();
            assert_eq!(config.team.name, "default");
            assert!(!config.team.agents.is_empty());
        }
    }
}
