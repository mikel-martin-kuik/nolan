use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// UI Configuration module
pub mod ui_config;
pub use ui_config::{UIConfig, load_ui_config, update_ssh_terminal_config, StatusConfig, SessionPrefixConfig, OllamaDefaults, AgentDisplayName, SshTerminalConfig, RuntimeConfig};

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
    #[serde(default)]
    pub schema_version: Option<u32>,
    #[serde(default)]
    pub agents: Vec<AgentConfig>,
    #[serde(default)]
    pub workflow: WorkflowConfig,
}

impl Default for WorkflowConfig {
    fn default() -> Self {
        WorkflowConfig {
            note_taker: None,
            exception_handler: None,
            disable_note_taker: false,
            disable_exception_handler: false,
            phases: vec![],
        }
    }
}

/// Agent configuration
/// Note: role and model are no longer stored in team config - they come from agent.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub name: String,
    #[serde(default)]
    pub output_file: Option<String>,
    #[serde(default)]
    pub required_sections: Vec<String>,
    #[serde(default = "default_file_permissions")]
    pub file_permissions: String,
    #[serde(default = "default_true")]
    pub workflow_participant: bool,
    #[serde(default)]
    pub awaits_qa: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qa_passes: Option<i32>,
}

fn default_file_permissions() -> String {
    "restricted".to_string()
}

fn default_true() -> bool {
    true
}

/// Workflow configuration with phases
/// Workflow is event-driven via hooks.
///
/// By default, note_taker (notary) and exception_handler (guardian) are mandatory.
/// Use disable_note_taker/disable_exception_handler to opt out if absolutely necessary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    /// Agent that documents workflow progress (maintains NOTES.md)
    /// Defaults to "notary" if not specified and not disabled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_taker: Option<String>,
    /// Agent that handles workflow exceptions (escalates to human)
    /// Defaults to "guardian" if not specified and not disabled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exception_handler: Option<String>,
    /// Force disable note_taker role (not recommended - breaks audit trail)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub disable_note_taker: bool,
    /// Force disable exception_handler role (not recommended - breaks escalation)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub disable_exception_handler: bool,
    #[serde(default, deserialize_with = "deserialize_phases_or_default")]
    pub phases: Vec<PhaseConfig>,
}

/// Deserialize phases, handling missing field
fn deserialize_phases_or_default<'de, D>(deserializer: D) -> Result<Vec<PhaseConfig>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_phases(deserializer)
}

/// Individual workflow phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseConfig {
    pub name: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub requires: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_reject: Option<String>,
}

/// Deserialize phases from either strings or full structs
fn deserialize_phases<'de, D>(deserializer: D) -> Result<Vec<PhaseConfig>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, SeqAccess, Visitor};

    struct PhasesVisitor;

    impl<'de> Visitor<'de> for PhasesVisitor {
        type Value = Vec<PhaseConfig>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a sequence of phase configs or phase names")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut phases = Vec::new();

            while let Some(value) = seq.next_element::<serde_yaml::Value>()? {
                let phase = match value {
                    serde_yaml::Value::String(name) => {
                        // Simple string format: just the phase name
                        PhaseConfig {
                            name: name.clone(),
                            owner: String::new(),
                            output: format!("{}.md", name),
                            requires: vec![],
                            template: None,
                            next: None,
                            on_reject: None,
                        }
                    }
                    serde_yaml::Value::Mapping(_) => {
                        // Full struct format
                        serde_yaml::from_value(value).map_err(de::Error::custom)?
                    }
                    _ => return Err(de::Error::custom("expected string or mapping for phase")),
                };
                phases.push(phase);
            }

            Ok(phases)
        }
    }

    deserializer.deserialize_seq(PhasesVisitor)
}

/// Department configuration for grouping teams
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Department {
    pub name: String,
    #[serde(default)]
    pub code: Option<String>,             // Short code (e.g., "ADM", "DEV")
    #[serde(default)]
    pub directory: Option<String>,        // Directory name in teams/ folder
    #[serde(default)]
    pub teams: Vec<String>,
    // Hierarchical support (V1.1)
    #[serde(default)]
    pub pillar: Option<String>,           // Parent pillar ID
    #[serde(default)]
    pub parent: Option<String>,           // Parent department (nested hierarchy)
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub policies: Option<DepartmentPolicies>,
    #[serde(default)]
    pub notes: Option<String>,            // Optional notes field
}

/// Department-level policy overrides
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DepartmentPolicies {
    #[serde(default)]
    pub budget_limit: Option<i64>,              // Cents, inherits from parent if None
    #[serde(default)]
    pub model_restriction: Option<Vec<String>>, // Allowed models
    #[serde(default)]
    pub escalation_timeout: Option<String>,     // Override default
}

/// Root departments configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentsConfig {
    #[serde(default)]
    pub version: Option<String>,  // Schema version for migration detection
    pub departments: Vec<Department>,
}

// =============================================================================
// Organization Types (V1.1)
// =============================================================================

/// Root organization configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationConfig {
    pub organization: Organization,
}

/// Organization definition with pillars
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub pillars: Vec<Pillar>,
    #[serde(default)]
    pub defaults: Option<OrganizationDefaults>,
}

/// Pillar definition (aligns with roadmap vision)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pillar {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version_target: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

/// Organization-level default settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrganizationDefaults {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub file_permissions: Option<String>,
    #[serde(default)]
    pub escalation_timeout: Option<String>,
}

// =============================================================================
// Team Info (for hierarchical team listing)
// =============================================================================

/// Team information with path/group metadata for hierarchical display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInfo {
    pub id: String,             // Team identifier (e.g., "structure_engineering")
    pub name: String,           // Display name from team config
    pub group: String,          // Directory group (e.g., "pillar_1", "foundation", "")
    pub pillar: Option<String>, // Pillar from org schema if applicable
    pub path: String,           // Relative path from teams/ (e.g., "pillar_1/structure_engineering.yaml")
}

// =============================================================================
// Role Types (V1.2)
// =============================================================================

/// Root role configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleConfig {
    pub role: Role,
}

/// Role template definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub name: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub permissions: RolePermissions,
    #[serde(default)]
    pub tools: RoleTools,
    #[serde(default)]
    pub model_preference: Option<String>,
    #[serde(default)]
    pub output_requirements: Option<OutputRequirements>,
}

/// Role permission settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RolePermissions {
    #[serde(default)]
    pub file_access: Option<String>,  // "restricted", "permissive", "no_projects"
    #[serde(default)]
    pub can_spawn_agents: bool,
    #[serde(default)]
    pub can_modify_workflow: bool,
}

/// Role tool configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoleTools {
    #[serde(default)]
    pub required: Vec<String>,
    #[serde(default)]
    pub optional: Vec<String>,
}

/// Output requirements for a role
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OutputRequirements {
    #[serde(default)]
    pub required_sections: Vec<String>,
    #[serde(default)]
    pub output_file: Option<String>,
}

// =============================================================================
// Policy Types (V1.3)
// =============================================================================

/// Root policy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub policy: Policy,
}

/// Policy definition with cascading settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub budget: Option<BudgetPolicy>,
    #[serde(default)]
    pub models: Option<ModelPolicy>,
    #[serde(default)]
    pub escalation: Option<EscalationPolicy>,
    #[serde(default)]
    pub execution: Option<ExecutionPolicy>,
    #[serde(default)]
    pub audit: Option<AuditPolicy>,
}

/// Budget control policy
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BudgetPolicy {
    #[serde(default)]
    pub daily_limit: Option<i64>,      // Cents
    #[serde(default)]
    pub project_limit: Option<i64>,    // Cents
    #[serde(default)]
    pub alert_threshold: Option<f64>,  // 0.0 - 1.0
}

/// Model allocation policy
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelPolicy {
    #[serde(default)]
    pub allowed: Vec<String>,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub opus_requires_approval: bool,
}

/// Escalation rules policy
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EscalationPolicy {
    #[serde(default)]
    pub timeout: Option<String>,
    #[serde(default)]
    pub budget_exceeded: Option<String>,
    #[serde(default)]
    pub quality_failed: Option<QualityFailedAction>,
    #[serde(default)]
    pub paths: Vec<String>,
}

/// Quality failure escalation actions
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QualityFailedAction {
    #[serde(default)]
    pub first_action: Option<String>,
    #[serde(default)]
    pub second_action: Option<String>,
}

/// Execution control policy
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecutionPolicy {
    #[serde(default)]
    pub max_concurrent_agents: Option<i32>,
    #[serde(default)]
    pub max_retries: Option<i32>,
    #[serde(default)]
    pub retry_delay: Option<String>,
}

/// Audit requirements policy
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuditPolicy {
    #[serde(default)]
    pub log_decisions: bool,
    #[serde(default)]
    pub log_file_changes: bool,
    #[serde(default)]
    pub require_rationale: bool,
}

// =============================================================================
// Work Request Types (Cross-Team Delegation)
// =============================================================================

/// Work request for cross-team delegation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkRequest {
    pub id: String,
    pub created: String,

    pub from_team: String,
    pub from_agent: String,
    pub to_team: String,

    #[serde(rename = "type")]
    pub request_type: String,
    pub priority: String,
    #[serde(default)]
    pub blocking: bool,

    pub title: String,
    pub description: String,

    #[serde(default)]
    pub acceptance_criteria: Vec<String>,

    pub status: String,
    #[serde(default)]
    pub accepted_by: Option<String>,
    #[serde(default)]
    pub accepted_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,

    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub deliverables: Vec<String>,

    #[serde(default)]
    pub rejection_reason: Option<String>,
    #[serde(default)]
    pub completion_notes: Option<String>,
}

// =============================================================================
// Codebase Ownership Types (Parallel Execution)
// =============================================================================

/// Root ownership configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnershipConfig {
    pub ownership: Ownership,
}

/// Ownership definition with rules and shared paths
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ownership {
    pub version: String,
    #[serde(default)]
    pub rules: Vec<OwnershipRule>,
    #[serde(default)]
    pub shared: Vec<SharedOwnership>,
}

/// Single ownership rule mapping team to directories/patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnershipRule {
    pub team: String,
    #[serde(default)]
    pub directories: Vec<String>,
    #[serde(default)]
    pub patterns: Vec<String>,
    #[serde(default)]
    pub exclusive: bool,
}

/// Shared file ownership across multiple teams
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedOwnership {
    pub path: String,
    pub owners: Vec<String>,
}

impl DepartmentsConfig {
    /// Load departments configuration from YAML file
    /// Returns empty config if file doesn't exist (graceful fallback)
    pub fn load() -> Result<Self, String> {
        let teams_dir = crate::utils::paths::get_teams_dir()?;

        let config_path = teams_dir.join("departments.yaml");

        if !config_path.exists() {
            // Return empty config for graceful fallback
            return Ok(DepartmentsConfig { version: None, departments: vec![] });
        }

        // Check file size (1MB max) - DoS protection
        let metadata = fs::metadata(&config_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;

        if metadata.len() > 1_048_576 {
            return Err(format!("Departments config too large: {} bytes (max 1MB)", metadata.len()));
        }

        let contents = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;

        serde_yaml::from_str(&contents)
            .map_err(|e| format!("Failed to parse YAML: {}", e))
    }

    /// Save departments configuration to YAML file
    pub fn save(&self) -> Result<(), String> {
        let teams_dir = crate::utils::paths::get_teams_dir()?;

        // Ensure teams directory exists
        if !teams_dir.exists() {
            fs::create_dir_all(&teams_dir)
                .map_err(|e| format!("Failed to create teams directory: {}", e))?;
        }

        let config_path = teams_dir.join("departments.yaml");

        let yaml_content = serde_yaml::to_string(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        fs::write(&config_path, yaml_content)
            .map_err(|e| format!("Failed to write config: {}", e))
    }
}

impl TeamConfig {
    /// Resolve team name to filesystem path
    /// Checks new format first (teams/{name}/team.yaml), then falls back to old format
    pub fn resolve_team_path(team_name: &str) -> Result<PathBuf, String> {
        let teams_dir = crate::utils::paths::get_teams_dir()?;

        // Priority 1: New format - teams/{name}/team.yaml
        let new_format_path = teams_dir.join(team_name).join("team.yaml");
        if new_format_path.exists() {
            return Ok(new_format_path);
        }

        // Priority 2: Old format - teams/{name}.yaml (backward compat)
        let old_format_path = teams_dir.join(format!("{}.yaml", team_name));
        if old_format_path.exists() {
            return Ok(old_format_path);
        }

        // Priority 3: Scan subdirectories for new format (pillar_1/team_a/team.yaml)
        if let Ok(entries) = fs::read_dir(&teams_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_dir() {
                    // Check for new format in subdirectory: pillar_1/team_a/team.yaml
                    let subdir_new_path = path.join(team_name).join("team.yaml");
                    if subdir_new_path.exists() {
                        return Ok(subdir_new_path);
                    }
                    // Check for old format in subdirectory: pillar_1/team_a.yaml
                    let subdir_old_path = path.join(format!("{}.yaml", team_name));
                    if subdir_old_path.exists() {
                        return Ok(subdir_old_path);
                    }
                }
            }
        }

        // Not found
        Err(format!("Team config not found: {} (checked new and old formats)", team_name))
    }

    /// Load team from resolved path
    pub fn load_from_path(config_path: &Path) -> Result<Self, String> {
        if !config_path.exists() {
            return Err(format!("Team config not found: {}", config_path.display()));
        }

        // Size check (DoS protection)
        let metadata = fs::metadata(config_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.len() > 1_048_576 {
            return Err(format!("Team config too large: {} bytes (max 1MB)", metadata.len()));
        }

        let contents = fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;

        let mut config: TeamConfig = serde_yaml::from_str(&contents)
            .map_err(|e| format!("Failed to parse YAML: {}", e))?;

        // Apply defaults for mandatory agents (note_taker and exception_handler)
        config.apply_defaults();

        config.validate()?;
        Ok(config)
    }

    /// Apply default values for mandatory agents.
    /// Sets note_taker to "notary" and exception_handler to "guardian" unless explicitly disabled.
    pub fn apply_defaults(&mut self) {
        // Default note_taker to "notary" (project tracker) unless disabled
        if self.team.workflow.note_taker.is_none() && !self.team.workflow.disable_note_taker {
            self.team.workflow.note_taker = Some("notary".to_string());
        }

        // Default exception_handler to "guardian" (escalates issues to humans) unless disabled
        if self.team.workflow.exception_handler.is_none() && !self.team.workflow.disable_exception_handler {
            self.team.workflow.exception_handler = Some("guardian".to_string());
        }
    }

    /// Load team configuration by name (with path resolution)
    ///
    /// Security measures:
    /// - File size limit: 1MB max
    /// - YAML depth checked implicitly by serde_yaml recursion limits
    /// - File permissions validated against allowed values
    /// - Path resolution only checks predefined subdirectories (no path traversal)
    pub fn load(team_name: &str) -> Result<Self, String> {
        let config_path = Self::resolve_team_path(team_name)?;
        Self::load_from_path(&config_path)
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

        // Validate note_taker: mandatory unless explicitly disabled
        // Note-taker (notary) maintains NOTES.md for audit trail
        if !self.team.workflow.disable_note_taker {
            match &self.team.workflow.note_taker {
                Some(note_taker) if !note_taker.is_empty() => {
                    if !seen_names.contains(note_taker.as_str()) {
                        return Err(format!(
                            "Note-taker '{}' not found in agents list for team '{}'. \
                            Add the agent or set disable_note_taker: true to opt out.",
                            note_taker, self.team.name
                        ));
                    }
                }
                _ => {
                    return Err(format!(
                        "Team '{}' requires a note_taker agent (defaults to 'notary'). \
                        Set disable_note_taker: true to opt out (not recommended).",
                        self.team.name
                    ));
                }
            }
        }

        // Validate exception_handler: mandatory unless explicitly disabled
        // Exception handler (guardian) escalates issues to humans
        if !self.team.workflow.disable_exception_handler {
            match &self.team.workflow.exception_handler {
                Some(handler) if !handler.is_empty() => {
                    if !seen_names.contains(handler.as_str()) {
                        return Err(format!(
                            "Exception handler '{}' not found in agents list for team '{}'. \
                            Add the agent or set disable_exception_handler: true to opt out.",
                            handler, self.team.name
                        ));
                    }
                }
                _ => {
                    return Err(format!(
                        "Team '{}' requires an exception_handler agent (defaults to 'guardian'). \
                        Set disable_exception_handler: true to opt out (not recommended).",
                        self.team.name
                    ));
                }
            }
        }

        // Validate all phase owners exist in agents list (skip empty owners - allows simplified phase lists)
        for phase in &self.team.workflow.phases {
            if !phase.owner.is_empty() && !seen_names.contains(phase.owner.as_str()) {
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

    /// Get note-taker agent name (maintains NOTES.md)
    pub fn note_taker(&self) -> Option<&str> {
        self.team.workflow.note_taker.as_deref()
    }

    /// Get coordinator agent name (deprecated - use note_taker instead)
    /// Returns note_taker for backward compatibility
    #[deprecated(note = "coordinator role is deprecated, use note_taker() instead")]
    pub fn coordinator(&self) -> Option<&str> {
        self.note_taker()
    }

    /// Get exception handler agent name
    pub fn exception_handler(&self) -> Option<&str> {
        self.team.workflow.exception_handler.as_deref()
    }

    /// Get coordinator's output file (deprecated - always returns NOTES.md)
    #[deprecated(note = "coordinator role is deprecated")]
    pub fn coordinator_output_file(&self) -> Result<String, String> {
        // Always return NOTES.md as the standard workflow tracking file
        Ok("NOTES.md".to_string())
    }

    /// Check if an agent is a workflow participant
    pub fn is_workflow_participant(&self, agent_name: &str) -> bool {
        self.team.agents.iter()
            .any(|a| a.name == agent_name && a.workflow_participant)
    }

    /// Get schema version (defaults to 1 for backward compatibility)
    pub fn schema_version(&self) -> u32 {
        self.team.schema_version.unwrap_or(1)
    }

    /// Get the first workflow phase
    pub fn first_phase(&self) -> Option<&PhaseConfig> {
        self.team.workflow.phases.first()
    }

    /// Get the owner of the first workflow phase
    pub fn first_phase_owner(&self) -> Option<&str> {
        self.first_phase().map(|p| p.owner.as_str())
    }

    /// Get phase at specific index
    pub fn get_phase(&self, index: usize) -> Option<&PhaseConfig> {
        self.team.workflow.phases.get(index)
    }

    /// Check if this team uses auto-progression (schema v2+)
    pub fn uses_auto_progression(&self) -> bool {
        self.schema_version() >= 2
    }
}

/// Helper struct for parsing YAML .team files
#[derive(Debug, Deserialize)]
struct TeamFileYaml {
    team: String,
}

/// Load team configuration for a specific project
///
/// Reads .team file from project directory, or defaults to "default" team
/// Supports both old plain text format and new YAML format
pub fn load_project_team(project_path: &Path) -> Result<TeamConfig, String> {
    let team_file = project_path.join(".team");
    let team_name = if team_file.exists() {
        let content = fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read .team file: {}", e))?;

        // Try parsing as YAML first (new format)
        if let Ok(parsed) = serde_yaml::from_str::<TeamFileYaml>(&content) {
            parsed.team
        } else {
            // Fall back to plain text format (old format)
            content.trim().to_string()
        }
    } else {
        "default".to_string()
    };
    TeamConfig::load(&team_name)
}

// =============================================================================
// Organization, Role, and Policy Loaders
// =============================================================================

use crate::constants::get_nolan_root;

/// Load organization configuration from YAML file
/// Returns default organization if schema doesn't exist (backwards compat)
pub fn load_organization_config() -> Result<OrganizationConfig, String> {
    let nolan_root = get_nolan_root()?;
    let org_path = PathBuf::from(&nolan_root).join("organization").join("schema.yaml");

    if !org_path.exists() {
        // Return default organization if schema doesn't exist (backwards compat)
        return Ok(OrganizationConfig {
            organization: Organization {
                name: "Nolan".to_string(),
                version: "1.0".to_string(),
                description: Some("AI Agent Control Panel".to_string()),
                pillars: vec![],
                defaults: None,
            }
        });
    }

    let content = fs::read_to_string(&org_path)
        .map_err(|e| format!("Failed to read organization schema: {}", e))?;

    // Size limit (DoS protection)
    if content.len() > 1_000_000 {
        return Err("Organization schema exceeds 1MB limit".to_string());
    }

    serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse organization schema: {}", e))
}

/// Load role configuration by name
/// Returns error if role template doesn't exist
pub fn load_role_config(role_name: &str) -> Result<RoleConfig, String> {
    let nolan_root = get_nolan_root()?;
    let role_path = PathBuf::from(&nolan_root).join("roles").join(format!("{}.yaml", role_name));

    if !role_path.exists() {
        return Err(format!("Role template not found: {}", role_name));
    }

    let content = fs::read_to_string(&role_path)
        .map_err(|e| format!("Failed to read role template: {}", e))?;

    if content.len() > 100_000 {
        return Err("Role template exceeds 100KB limit".to_string());
    }

    serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse role template: {}", e))
}

/// List all available role templates
pub fn list_roles() -> Result<Vec<String>, String> {
    let nolan_root = get_nolan_root()?;
    let roles_path = PathBuf::from(&nolan_root).join("roles");

    if !roles_path.exists() {
        return Ok(vec![]);
    }

    let mut roles = Vec::new();
    for entry in fs::read_dir(&roles_path)
        .map_err(|e| format!("Failed to read roles directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "yaml") {
            if let Some(stem) = path.file_stem() {
                roles.push(stem.to_string_lossy().to_string());
            }
        }
    }

    roles.sort();
    Ok(roles)
}

/// Load policy configuration by name
/// Falls back to default policy if not found
pub fn load_policy_config(policy_name: &str) -> Result<PolicyConfig, String> {
    let nolan_root = get_nolan_root()?;
    let policy_path = PathBuf::from(&nolan_root).join("policies").join(format!("{}.yaml", policy_name));

    if !policy_path.exists() {
        // Fall back to default policy
        if policy_name != "default" {
            return load_policy_config("default");
        }
        // Return empty policy if no default exists (backwards compat)
        return Ok(PolicyConfig {
            policy: Policy {
                name: "default".to_string(),
                version: Some("1.0".to_string()),
                description: None,
                budget: None,
                models: None,
                escalation: None,
                execution: None,
                audit: None,
            }
        });
    }

    let content = fs::read_to_string(&policy_path)
        .map_err(|e| format!("Failed to read policy: {}", e))?;

    if content.len() > 100_000 {
        return Err("Policy file exceeds 100KB limit".to_string());
    }

    serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse policy: {}", e))
}

/// Merge child policy with parent, child values override parent
pub fn merge_policies(parent: &Policy, child: &Policy) -> Policy {
    Policy {
        name: child.name.clone(),
        version: child.version.clone().or_else(|| parent.version.clone()),
        description: child.description.clone().or_else(|| parent.description.clone()),
        budget: merge_budget_policy(&parent.budget, &child.budget),
        models: merge_model_policy(&parent.models, &child.models),
        escalation: merge_escalation_policy(&parent.escalation, &child.escalation),
        execution: merge_execution_policy(&parent.execution, &child.execution),
        audit: merge_audit_policy(&parent.audit, &child.audit),
    }
}

fn merge_budget_policy(parent: &Option<BudgetPolicy>, child: &Option<BudgetPolicy>) -> Option<BudgetPolicy> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p.clone()),
        (None, Some(c)) => Some(c.clone()),
        (Some(p), Some(c)) => Some(BudgetPolicy {
            daily_limit: c.daily_limit.or(p.daily_limit),
            project_limit: c.project_limit.or(p.project_limit),
            alert_threshold: c.alert_threshold.or(p.alert_threshold),
        }),
    }
}

fn merge_model_policy(parent: &Option<ModelPolicy>, child: &Option<ModelPolicy>) -> Option<ModelPolicy> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p.clone()),
        (None, Some(c)) => Some(c.clone()),
        (Some(p), Some(c)) => Some(ModelPolicy {
            allowed: if c.allowed.is_empty() { p.allowed.clone() } else { c.allowed.clone() },
            default: c.default.clone().or_else(|| p.default.clone()),
            opus_requires_approval: c.opus_requires_approval || p.opus_requires_approval,
        }),
    }
}

fn merge_escalation_policy(parent: &Option<EscalationPolicy>, child: &Option<EscalationPolicy>) -> Option<EscalationPolicy> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p.clone()),
        (None, Some(c)) => Some(c.clone()),
        (Some(p), Some(c)) => Some(EscalationPolicy {
            timeout: c.timeout.clone().or_else(|| p.timeout.clone()),
            budget_exceeded: c.budget_exceeded.clone().or_else(|| p.budget_exceeded.clone()),
            quality_failed: c.quality_failed.clone().or_else(|| p.quality_failed.clone()),
            paths: if c.paths.is_empty() { p.paths.clone() } else { c.paths.clone() },
        }),
    }
}

fn merge_execution_policy(parent: &Option<ExecutionPolicy>, child: &Option<ExecutionPolicy>) -> Option<ExecutionPolicy> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p.clone()),
        (None, Some(c)) => Some(c.clone()),
        (Some(p), Some(c)) => Some(ExecutionPolicy {
            max_concurrent_agents: c.max_concurrent_agents.or(p.max_concurrent_agents),
            max_retries: c.max_retries.or(p.max_retries),
            retry_delay: c.retry_delay.clone().or_else(|| p.retry_delay.clone()),
        }),
    }
}

fn merge_audit_policy(parent: &Option<AuditPolicy>, child: &Option<AuditPolicy>) -> Option<AuditPolicy> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p.clone()),
        (None, Some(c)) => Some(c.clone()),
        (Some(p), Some(c)) => Some(AuditPolicy {
            log_decisions: c.log_decisions || p.log_decisions,
            log_file_changes: c.log_file_changes || p.log_file_changes,
            require_rationale: c.require_rationale || p.require_rationale,
        }),
    }
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
