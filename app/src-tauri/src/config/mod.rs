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
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    pub agents: Vec<AgentConfig>,
    pub workflow: WorkflowConfig,
    pub communication: CommunicationConfig,
}

/// Agent configuration
/// Note: role and model are no longer stored in team config - they come from agent.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub name: String,
    pub output_file: Option<String>,
    pub required_sections: Vec<String>,
    pub file_permissions: String,
    pub workflow_participant: bool,
    #[serde(default)]
    pub awaits_qa: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_passes: Option<i32>,
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
    /// - File permissions validated against allowed values
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

        // Validate file permissions for all agents
        config.validate()?;

        Ok(config)
    }

    /// Validate team configuration constraints
    pub fn validate(&self) -> Result<(), String> {
        use std::collections::HashSet;

        const VALID_PERMISSIONS: &[&str] = &["restricted", "permissive", "no_projects"];

        // Collect agent names and check for duplicates
        let mut seen_names: HashSet<&str> = HashSet::new();
        for agent in &self.team.agents {
            if !seen_names.insert(&agent.name) {
                return Err(format!(
                    "Duplicate agent name '{}' in team '{}'",
                    agent.name, self.team.name
                ));
            }

            if !VALID_PERMISSIONS.contains(&agent.file_permissions.as_str()) {
                return Err(format!(
                    "Invalid file_permissions for agent '{}': '{}'. Must be one of: {}",
                    agent.name,
                    agent.file_permissions,
                    VALID_PERMISSIONS.join(", ")
                ));
            }
        }

        // Validate coordinator exists in agents list
        let coordinator = &self.team.workflow.coordinator;
        if !seen_names.contains(coordinator.as_str()) {
            return Err(format!(
                "Coordinator '{}' not found in agents list for team '{}'",
                coordinator, self.team.name
            ));
        }

        // Validate all phase owners exist in agents list
        for phase in &self.team.workflow.phases {
            if !seen_names.contains(phase.owner.as_str()) {
                return Err(format!(
                    "Phase '{}' owner '{}' not found in agents list for team '{}'",
                    phase.name, phase.owner, self.team.name
                ));
            }
        }

        Ok(())
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

    /// Get all agent names in this team
    pub fn agent_names(&self) -> Vec<&str> {
        self.team.agents.iter()
            .map(|a| a.name.as_str())
            .collect()
    }

    /// Get coordinator agent name
    pub fn coordinator(&self) -> &str {
        &self.team.workflow.coordinator
    }

    /// Get coordinator's output file from team config
    pub fn coordinator_output_file(&self) -> String {
        self.team.agents.iter()
            .find(|a| a.name == self.team.workflow.coordinator)
            .and_then(|a| a.output_file.as_ref())
            .map(|s| s.to_string())
            .expect("Coordinator must have output_file defined in team config")
    }

    /// Check if an agent is a workflow participant
    pub fn is_workflow_participant(&self, agent_name: &str) -> bool {
        self.team.agents.iter()
            .any(|a| a.name == agent_name && a.workflow_participant)
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
