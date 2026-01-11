use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use serde_json;
use chrono::Local;

/// Agent directory information
#[derive(Serialize, Deserialize)]
pub struct AgentDirectoryInfo {
    pub name: String,
    pub exists: bool,
    pub has_claude_md: bool,
    pub has_agent_json: bool,
    pub path: String,
    pub role: Option<String>,
    pub model: Option<String>,
}

/// Agent metadata stored in agent.json
#[derive(Serialize, Deserialize, Clone)]
pub struct AgentMetadata {
    pub role: String,
    pub model: String,
}

/// Validate agent name format (lowercase, alphanumeric, underscores only)
/// Note: Hyphens are reserved as delimiters in session names
fn validate_agent_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }

    if !name.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
        return Err("Agent name must start with a lowercase letter".to_string());
    }

    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("Agent name must contain only lowercase letters, digits, and underscores".to_string());
    }

    // Check for path traversal
    if name.contains("..") || name.contains("/") || name.contains("\\") {
        return Err("Agent name cannot contain path separators or '..'".to_string());
    }

    Ok(())
}

/// Get the agents directory path
fn get_agents_dir() -> Result<PathBuf, String> {
    crate::utils::paths::get_agents_dir()
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

/// List all agent directories under app/agents/
#[tauri::command]
pub async fn list_agent_directories() -> Result<Vec<AgentDirectoryInfo>, String> {
    let agents_dir = get_agents_dir()?;

    if !agents_dir.exists() {
        return Ok(vec![]); // Return empty list if agents directory doesn't exist
    }

    let mut agent_infos = Vec::new();

    for entry in fs::read_dir(&agents_dir)
        .map_err(|e| format!("Failed to read agents directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                // Skip hidden directories and special directories
                if name.starts_with('.') {
                    continue;
                }

                let claude_md_path = path.join("CLAUDE.md");
                let has_claude_md = claude_md_path.exists() && claude_md_path.is_file();

                let agent_json_path = path.join("agent.json");
                let has_agent_json = agent_json_path.exists() && agent_json_path.is_file();

                // Read agent metadata if available
                let metadata = read_agent_metadata(&path);

                agent_infos.push(AgentDirectoryInfo {
                    name: name.to_string(),
                    exists: true,
                    has_claude_md,
                    has_agent_json,
                    path: path.to_string_lossy().to_string(),
                    role: metadata.as_ref().map(|m| m.role.clone()),
                    model: metadata.as_ref().map(|m| m.model.clone()),
                });
            }
        }
    }

    // Sort alphabetically
    agent_infos.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(agent_infos)
}

/// Create agent directory structure
#[tauri::command]
pub async fn create_agent_directory(agent_name: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let agents_dir = get_agents_dir()?;
    let agent_dir = agents_dir.join(&agent_name);

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
#[tauri::command]
pub async fn get_agent_role_file(agent_name: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let agents_dir = get_agents_dir()?;
    let claude_md_path = agents_dir.join(&agent_name).join("CLAUDE.md");

    if !claude_md_path.exists() {
        return Err(format!("CLAUDE.md not found for agent '{}'", agent_name));
    }

    // Verify the path is still within agents directory (security check)
    let canonical_agents = agents_dir.canonicalize()
        .map_err(|e| format!("Failed to canonicalize agents directory: {}", e))?;
    let canonical_file = claude_md_path.canonicalize()
        .map_err(|e| format!("Failed to canonicalize file path: {}", e))?;

    if !canonical_file.starts_with(&canonical_agents) {
        return Err("Security violation: Path is outside agents directory".to_string());
    }

    fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Save CLAUDE.md content for an agent
#[tauri::command]
pub async fn save_agent_role_file(agent_name: String, content: String) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    // Validate content is not empty
    if content.trim().is_empty() {
        return Err("CLAUDE.md content cannot be empty".to_string());
    }

    let agents_dir = get_agents_dir()?;
    let agent_dir = agents_dir.join(&agent_name);
    let claude_md_path = agent_dir.join("CLAUDE.md");

    // Ensure agent directory exists
    if !agent_dir.exists() {
        return Err(format!("Agent directory '{}' does not exist", agent_name));
    }

    // Create backup if file exists
    if claude_md_path.exists() {
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let backup_path = agent_dir.join(format!("CLAUDE.md.backup.{}", timestamp));

        fs::copy(&claude_md_path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // Write the file
    fs::write(&claude_md_path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok(())
}

/// Delete agent directory
#[tauri::command]
pub async fn delete_agent_directory(agent_name: String, force: bool) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let agents_dir = get_agents_dir()?;
    let agent_dir = agents_dir.join(&agent_name);

    if !agent_dir.exists() {
        return Err(format!("Agent directory '{}' does not exist", agent_name));
    }

    // If not forcing, check if agent is in team configs
    if !force {
        // Load default team config to check if agent is in use
        if let Ok(team) = crate::config::TeamConfig::load("default") {
            let agent_names: Vec<&str> = team.agent_names();
            if agent_names.contains(&agent_name.as_str()) {
                return Err(format!(
                    "Agent '{}' is in use by team config 'default'. Use force=true to delete anyway.",
                    agent_name
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
#[tauri::command]
pub async fn save_agent_metadata(agent_name: String, role: String, model: String) -> Result<(), String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let agents_dir = get_agents_dir()?;
    let agent_dir = agents_dir.join(&agent_name);

    // Ensure agent directory exists
    if !agent_dir.exists() {
        return Err(format!("Agent directory '{}' does not exist", agent_name));
    }

    let metadata = AgentMetadata { role, model };
    let metadata_path = agent_dir.join("agent.json");

    let content = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&metadata_path, content)
        .map_err(|e| format!("Failed to write agent.json: {}", e))?;

    Ok(())
}

/// Get agent metadata from agent.json
#[tauri::command]
pub async fn get_agent_metadata(agent_name: String) -> Result<Option<AgentMetadata>, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let agents_dir = get_agents_dir()?;
    let agent_dir = agents_dir.join(&agent_name);

    if !agent_dir.exists() {
        return Ok(None);
    }

    Ok(read_agent_metadata(&agent_dir))
}

/// Get CLAUDE.md template for new agents
#[tauri::command]
pub async fn get_agent_template(agent_name: String, role: String) -> Result<String, String> {
    // Validate agent name
    validate_agent_name(&agent_name)?;

    let role_lower = role.to_lowercase();
    let skill_name = agent_name.replace("-", "_");

    let template = format!(r#"# {agent_name} - {role}

You are {agent_name}, the {role_lower} agent.

## Role

- [Primary responsibility]
- [Secondary responsibility]
- [Additional capabilities]

## Input

**ALWAYS** read these files first:
- `$DOCS_PATH/prompt.md` - Original requirements
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
        skill_name = skill_name
    );

    Ok(template)
}
