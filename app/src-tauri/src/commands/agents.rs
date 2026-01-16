use crate::config::get_prompt_file;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::path::PathBuf;

/// Agent directory information
#[derive(Serialize, Deserialize)]
pub struct AgentDirectoryInfo {
    pub name: String,
    pub exists: bool,
    pub has_claude_md: bool,
    pub has_agent_json: bool,
    pub has_agent_yaml: bool,
    pub path: String,
    pub role: Option<String>,
    pub model: Option<String>,
    /// Team this agent belongs to (None for shared/ralph agents)
    pub team: Option<String>,
}

/// Agent metadata stored in agent.json
#[derive(Serialize, Deserialize, Clone)]
pub struct AgentMetadata {
    pub role: String,
    pub model: String,
}

/// Agent metadata from agent.yaml (for cron/predefined agents)
#[derive(Deserialize)]
#[allow(dead_code)]
struct AgentYamlMetadata {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

/// Validate agent name format (lowercase, alphanumeric, underscores only)
/// Note: Hyphens are reserved as delimiters in session names
fn validate_agent_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }

    if !name
        .chars()
        .next()
        .map(|c| c.is_ascii_lowercase())
        .unwrap_or(false)
    {
        return Err("Agent name must start with a lowercase letter".to_string());
    }

    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(
            "Agent name must contain only lowercase letters, digits, and underscores".to_string(),
        );
    }

    // Check for path traversal
    if name.contains("..") || name.contains("/") || name.contains("\\") {
        return Err("Agent name cannot contain path separators or '..'".to_string());
    }

    Ok(())
}

/// Get the agents config directory path (shared agents like ralph and templates)
fn get_agents_dir() -> Result<PathBuf, String> {
    crate::utils::paths::get_agents_config_dir()
}

/// Role-based subdirectories for agent organization
const ROLE_SUBDIRS: &[&str] = &[
    "implementers",
    "analyzers",
    "testers",
    "mergers",
    "builders",
    "scanners",
    "indexers",
    "monitors",
    "researchers",
    "planners",
    "free",
];

/// Find an agent by name, searching all team directories and shared agents
/// Returns (agent_dir, team_name) where team_name is None for shared agents
fn find_agent(agent_name: &str) -> Result<(PathBuf, Option<String>), String> {
    let agents_dir = get_agents_dir()?;

    // First check shared agents directory (flat structure - legacy)
    let shared_agent_dir = agents_dir.join(agent_name);
    if shared_agent_dir.exists() {
        return Ok((shared_agent_dir, None));
    }

    // Search role-based subdirectories (new structure)
    for role_subdir in ROLE_SUBDIRS {
        let role_agent_dir = agents_dir.join(role_subdir).join(agent_name);
        if role_agent_dir.exists() {
            return Ok((role_agent_dir, None));
        }
    }

    // Search all team directories
    let teams_dir = crate::utils::paths::get_teams_dir()?;
    if teams_dir.exists() {
        for team_entry in fs::read_dir(&teams_dir).map_err(|e| e.to_string())? {
            let team_entry = team_entry.map_err(|e| e.to_string())?;
            let team_path = team_entry.path();

            if !team_path.is_dir() {
                continue;
            }

            let team_name = team_path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            let team_agent_dir = team_path.join("agents").join(agent_name);
            if team_agent_dir.exists() {
                return Ok((team_agent_dir, Some(team_name.to_string())));
            }
        }
    }

    Err(format!("Agent '{}' not found", agent_name))
}

/// Read agent metadata from agent.json
fn read_agent_metadata(agent_dir: &PathBuf) -> Option<AgentMetadata> {
    let metadata_path = agent_dir.join("agent.json");
    if metadata_path.exists() {
        if let Ok(content) = fs::read_to_string(&metadata_path) {
            if let Ok(metadata) = serde_json::from_str::<AgentMetadata>(&content) {
                return Some(metadata);
            }
        }
    }
    None
}

/// Read agent metadata from agent.yaml (for cron/predefined agents)
fn read_agent_yaml_metadata(agent_dir: &PathBuf) -> Option<AgentYamlMetadata> {
    let yaml_path = agent_dir.join("agent.yaml");
    if yaml_path.exists() {
        if let Ok(content) = fs::read_to_string(&yaml_path) {
            if let Ok(metadata) = serde_yaml::from_str::<AgentYamlMetadata>(&content) {
                return Some(metadata);
            }
        }
    }
    None
}

/// Helper to create AgentDirectoryInfo from a path
fn agent_info_from_path(
    path: &std::path::Path,
    team: Option<String>,
) -> Option<AgentDirectoryInfo> {
    let name = path.file_name().and_then(|n| n.to_str())?;

    // Skip hidden directories
    if name.starts_with('.') {
        return None;
    }

    let claude_md_path = path.join("CLAUDE.md");
    let has_claude_md = claude_md_path.exists() && claude_md_path.is_file();

    let agent_json_path = path.join("agent.json");
    let has_agent_json = agent_json_path.exists() && agent_json_path.is_file();

    let agent_yaml_path = path.join("agent.yaml");
    let has_agent_yaml = agent_yaml_path.exists() && agent_yaml_path.is_file();

    // Try to read agent metadata from agent.json first, then agent.yaml
    let path_buf = path.to_path_buf();
    let json_metadata = read_agent_metadata(&path_buf);
    let yaml_metadata = read_agent_yaml_metadata(&path_buf);

    // Use JSON metadata if available, otherwise fall back to YAML
    let (role, model) = if let Some(ref m) = json_metadata {
        (Some(m.role.clone()), Some(m.model.clone()))
    } else if let Some(ref m) = yaml_metadata {
        // For YAML agents (cron/predefined), use description as role
        (m.description.clone(), m.model.clone())
    } else {
        (None, None)
    };

    Some(AgentDirectoryInfo {
        name: name.to_string(),
        exists: true,
        has_claude_md,
        has_agent_json,
        has_agent_yaml,
        path: path.to_string_lossy().to_string(),
        role,
        model,
        team,
    })
}

/// List all agent directories from both teams/{team}/agents/ and agents/ (shared)
#[tauri::command]
pub async fn list_agent_directories() -> Result<Vec<AgentDirectoryInfo>, String> {
    let mut agent_infos = Vec::new();

    // Scan teams/{team}/agents/ directories for team agents
    let teams_dir = crate::utils::paths::get_teams_dir()?;
    if teams_dir.exists() {
        for team_entry in fs::read_dir(&teams_dir)
            .map_err(|e| format!("Failed to read teams directory: {}", e))?
        {
            let team_entry = team_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let team_path = team_entry.path();

            if !team_path.is_dir() {
                continue;
            }

            let team_name = team_path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            // Skip hidden directories
            if team_name.starts_with('.') {
                continue;
            }

            // Check for agents subdirectory
            let team_agents_dir = team_path.join("agents");
            if !team_agents_dir.exists() || !team_agents_dir.is_dir() {
                continue;
            }

            // Scan team's agents directory
            for agent_entry in fs::read_dir(&team_agents_dir)
                .map_err(|e| format!("Failed to read team agents directory: {}", e))?
            {
                let agent_entry =
                    agent_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
                let agent_path = agent_entry.path();

                if agent_path.is_dir() {
                    if let Some(info) =
                        agent_info_from_path(&agent_path, Some(team_name.to_string()))
                    {
                        agent_infos.push(info);
                    }
                }
            }
        }
    }

    // Scan agents/ directory for shared agents (ralph, predefined templates)
    let agents_dir = get_agents_dir()?;
    if agents_dir.exists() {
        for entry in fs::read_dir(&agents_dir)
            .map_err(|e| format!("Failed to read agents directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                // Check if this is a role-based subdirectory
                if ROLE_SUBDIRS.contains(&dir_name) {
                    // Scan agents within this role subdirectory
                    if let Ok(role_entries) = fs::read_dir(&path) {
                        for role_entry in role_entries.flatten() {
                            let role_agent_path = role_entry.path();
                            if role_agent_path.is_dir() {
                                if let Some(info) = agent_info_from_path(&role_agent_path, None) {
                                    agent_infos.push(info);
                                }
                            }
                        }
                    }
                } else {
                    // Legacy flat structure - direct agent directory
                    if let Some(info) = agent_info_from_path(&path, None) {
                        agent_infos.push(info);
                    }
                }
            }
        }
    }

    // Sort by team (None first), then by name
    agent_infos.sort_by(|a, b| match (&a.team, &b.team) {
        (None, Some(_)) => std::cmp::Ordering::Less,
        (Some(_), None) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(agent_infos)
}

/// Create agent directory structure
/// If team_name is provided, creates in teams/{team}/agents/{agent}/
/// Otherwise creates in agents/{agent}/ (for shared agents like ralph)
#[tauri::command(rename_all = "snake_case")]
pub async fn create_agent_directory(
    agent_name: String,
    team_name: Option<String>,
) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Validate team name if provided
    if let Some(ref team) = team_name {
        if team.contains("..") || team.contains("/") || team.contains("\\") {
            return Err("Invalid team name: path traversal not allowed".to_string());
        }
    }

    // Determine agent directory based on team
    let agent_dir = if let Some(ref team) = team_name {
        // Team agent: teams/{team}/agents/{agent}/
        let team_agents_dir = crate::utils::paths::get_team_agents_dir(team)?;
        // Ensure team agents directory exists
        if !team_agents_dir.exists() {
            fs::create_dir_all(&team_agents_dir)
                .map_err(|e| format!("Failed to create team agents directory: {}", e))?;
        }
        team_agents_dir.join(&agent_name)
    } else {
        // Shared agent: agents/{agent}/
        let agents_dir = get_agents_dir()?;
        agents_dir.join(&agent_name)
    };

    // Check if directory already exists
    if agent_dir.exists() {
        return Err(format!("Agent directory '{}' already exists", agent_name));
    }

    // Create the directory
    fs::create_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to create agent directory: {}", e))?;

    // Create symlink to .claude (following pattern from existing agents)
    // .claude config directory is source code, so it stays relative to app root
    let app_root = crate::utils::paths::get_nolan_app_root()
        .map_err(|e| format!("Failed to get app root: {}", e))?;
    let claude_link = agent_dir.join(".claude");
    let claude_target = app_root.join(".claude");

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&claude_target, &claude_link)
            .map_err(|e| format!("Failed to create .claude symlink: {}", e))?;
    }

    #[cfg(windows)]
    {
        // On Windows, use junction for directories
        std::os::windows::fs::symlink_dir(&claude_target, &claude_link)
            .map_err(|e| format!("Failed to create .claude symlink: {}", e))?;
    }

    Ok(agent_dir.to_string_lossy().to_string())
}

/// Get CLAUDE.md content for an agent
/// Searches both team-specific and shared agent directories
#[tauri::command(rename_all = "snake_case")]
pub async fn get_agent_role_file(agent_name: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Find agent in any location
    let (agent_dir, _team) = find_agent(&agent_name)?;
    let claude_md_path = agent_dir.join("CLAUDE.md");

    if !claude_md_path.exists() {
        return Err(format!("CLAUDE.md not found for agent '{}'", agent_name));
    }

    fs::read_to_string(&claude_md_path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Save CLAUDE.md content for an agent
/// Searches both team-specific and shared agent directories
#[tauri::command(rename_all = "snake_case")]
pub async fn save_agent_role_file(agent_name: String, content: String) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Validate content is not empty
    if content.trim().is_empty() {
        return Err("CLAUDE.md content cannot be empty".to_string());
    }

    // Find agent in any location
    let (agent_dir, _team) = find_agent(&agent_name)?;
    let claude_md_path = agent_dir.join("CLAUDE.md");

    // Create backup if file exists
    if claude_md_path.exists() {
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let backup_path = agent_dir.join(format!("CLAUDE.md.backup.{}", timestamp));

        fs::copy(&claude_md_path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // Write the file
    fs::write(&claude_md_path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok(())
}

/// Delete agent directory
/// Searches both team-specific and shared agent directories
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_agent_directory(agent_name: String, force: bool) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Find agent in any location
    let (agent_dir, team) = find_agent(&agent_name)?;

    // If not forcing, check if agent is in team configs
    if !force {
        // Check if agent is in the team's config
        let team_to_check = team.as_deref().unwrap_or("default");
        if let Ok(team_config) = crate::config::TeamConfig::load(team_to_check) {
            let agent_names: Vec<&str> = team_config.agent_names();
            if agent_names.contains(&agent_name.as_str()) {
                return Err(format!(
                    "Agent '{}' is in use by team config '{}'. Use force=true to delete anyway.",
                    agent_name, team_to_check
                ));
            }
        }
    }

    // Remove the directory
    fs::remove_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to delete agent directory: {}", e))?;

    Ok(())
}

/// Save agent metadata to agent.json
/// Searches both team-specific and shared agent directories
#[tauri::command(rename_all = "snake_case")]
pub async fn save_agent_metadata(
    agent_name: String,
    role: String,
    model: String,
) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Find agent in any location
    let (agent_dir, _team) = find_agent(&agent_name)?;

    let metadata = AgentMetadata { role, model };
    let metadata_path = agent_dir.join("agent.json");

    let content = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&metadata_path, content).map_err(|e| format!("Failed to write agent.json: {}", e))?;

    Ok(())
}

/// Get agent metadata from agent.json
/// Searches both team-specific and shared agent directories
#[tauri::command(rename_all = "snake_case")]
pub async fn get_agent_metadata(agent_name: String) -> Result<Option<AgentMetadata>, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Try to find agent, return None if not found
    match find_agent(&agent_name) {
        Ok((agent_dir, _team)) => Ok(read_agent_metadata(&agent_dir)),
        Err(_) => Ok(None),
    }
}

/// Get CLAUDE.md template for new agents
#[tauri::command(rename_all = "snake_case")]
pub async fn get_agent_template(agent_name: String, role: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let role_lower = role.to_lowercase();
    let skill_name = agent_name.replace("-", "_");
    let prompt_filename = get_prompt_file();

    let template = format!(
        r#"# {agent_name} - {role}

You are {agent_name}, the {role_lower} agent.

## Role

- [Primary responsibility]
- [Secondary responsibility]
- [Additional capabilities]

## Input

**ALWAYS** read these files first:
- `$DOCS_PATH/{prompt_file}` - Original requirements (raw user input)
- Predecessor output files as specified in your assignment

## Output

**ALWAYS** write output to `$DOCS_PATH/$OUTPUT_FILE`. Include:
- `## Summary` - Brief overview of work completed
- `## Details` - Detailed findings or implementation notes
- `## Next Steps` - Recommendations for next phase

## Style

- Clear and concise communication
- Follow project conventions
- Document decisions and rationale

## Skills

**Primary:** `nolan:{skill_name}` - bundled capabilities

Use for:
- [Capability 1]
- [Capability 2]
- [Capability 3]

**IMPORTANT:** [Any special instructions, constraints, or guidelines for this agent]
"#,
        agent_name = agent_name,
        role = role,
        role_lower = role_lower,
        skill_name = skill_name,
        prompt_file = prompt_filename
    );

    Ok(template)
}
