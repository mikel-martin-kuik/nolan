use crate::config::{DepartmentsConfig, TeamConfig, TeamInfo};
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

/// Agent metadata stored in agent.json
#[derive(Serialize, Deserialize)]
struct AgentMetadata {
    role: String,
    model: String,
}

/// Get team configuration by name
#[tauri::command(rename_all = "snake_case")]
pub async fn get_team_config(team_name: String) -> Result<TeamConfig, String> {
    TeamConfig::load(&team_name)
}

/// Save team configuration to file
///
/// Security: Validates team name to prevent path traversal attacks
/// Writes to new format: teams/{team_name}/team.yaml
#[tauri::command(rename_all = "snake_case")]
pub async fn save_team_config(team_name: String, config: TeamConfig) -> Result<(), String> {
    // Validate team_name doesn't contain path traversal
    if team_name.contains("..") || team_name.contains("/") || team_name.contains("\\") {
        return Err("Invalid team name: path traversal not allowed".to_string());
    }

    // Validate team name format
    if !team_name
        .chars()
        .next()
        .map(|c| c.is_ascii_lowercase())
        .unwrap_or(false)
    {
        return Err("Team name must start with a lowercase letter".to_string());
    }

    if !team_name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(
            "Team name must contain only lowercase letters, digits, and underscores".to_string(),
        );
    }

    // Create team directory structure: teams/{team_name}/
    let team_dir = crate::utils::paths::get_team_dir(&team_name)?;
    if !team_dir.exists() {
        fs::create_dir_all(&team_dir)
            .map_err(|e| format!("Failed to create team directory: {}", e))?;
    }

    // Create agents subdirectory: teams/{team_name}/agents/
    let agents_dir = crate::utils::paths::get_team_agents_dir(&team_name)?;
    if !agents_dir.exists() {
        fs::create_dir_all(&agents_dir)
            .map_err(|e| format!("Failed to create team agents directory: {}", e))?;
    }

    // Write config to teams/{team_name}/team.yaml
    let config_path = crate::utils::paths::get_team_config_path(&team_name)?;

    // Serialize to YAML
    let yaml_content =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    // Write to file
    fs::write(&config_path, yaml_content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    // Create agent directories and agent.json for each agent
    for agent in &config.team.agents {
        let agent_dir = agents_dir.join(&agent.name);
        if !agent_dir.exists() {
            fs::create_dir_all(&agent_dir)
                .map_err(|e| format!("Failed to create agent directory '{}': {}", agent.name, e))?;
        }

        // Write agent.json with role and model
        let agent_json_path = agent_dir.join("agent.json");
        let metadata = AgentMetadata {
            role: agent.role.clone(),
            model: agent.model.clone(),
        };
        let json_content = serde_json::to_string_pretty(&metadata)
            .map_err(|e| format!("Failed to serialize agent metadata: {}", e))?;
        fs::write(&agent_json_path, json_content)
            .map_err(|e| format!("Failed to write agent.json for '{}': {}", agent.name, e))?;

        // Create empty CLAUDE.md if it doesn't exist
        let claude_md_path = agent_dir.join("CLAUDE.md");
        if !claude_md_path.exists() {
            fs::write(&claude_md_path, "")
                .map_err(|e| format!("Failed to create CLAUDE.md for '{}': {}", agent.name, e))?;
        }
    }

    Ok(())
}

/// Recursively scan a directory for team configurations
/// Supports both new format (team_name/team.yaml) and old format (team_name.yaml)
/// Returns tuples of (team_id, group, relative_path)
fn scan_teams_recursive(
    teams_dir: &std::path::Path,
) -> Result<Vec<(String, String, String)>, String> {
    let mut teams = Vec::new();
    let mut seen_teams = std::collections::HashSet::new();

    for entry in WalkDir::new(teams_dir)
        .max_depth(3) // Support teams/{team}/team.yaml and pillar/{team}/team.yaml
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Skip non-yaml files
        if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("yaml") {
            continue;
        }

        // Skip departments.yaml and template files (starting with _)
        let file_stem = path.file_stem().and_then(|s| s.to_str());
        if file_stem == Some("departments")
            || file_stem.map(|s| s.starts_with('_')).unwrap_or(false)
        {
            continue;
        }

        // Get relative path from teams_dir
        let relative = path
            .strip_prefix(teams_dir)
            .map_err(|_| "Failed to get relative path")?;

        let relative_str = relative
            .to_str()
            .ok_or("Invalid path encoding")?
            .to_string();

        // Determine team_id and group based on path structure
        let (team_id, group) = if file_stem == Some("team") {
            // New format: teams/{team}/team.yaml or teams/{group}/{team}/team.yaml
            let parent = path.parent().ok_or("No parent directory")?;
            let team_name = parent
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or("Invalid team directory name")?;

            // Check if there's a group (grandparent is not teams_dir)
            let grandparent = parent.parent();
            let group = if grandparent == Some(teams_dir) {
                "".to_string()
            } else {
                grandparent
                    .and_then(|p| p.strip_prefix(teams_dir).ok())
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .to_string()
            };

            (team_name.to_string(), group)
        } else {
            // Old format: teams/{team}.yaml or teams/{group}/{team}.yaml
            let stem = file_stem.ok_or("No file stem")?.to_string();
            let group = relative
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();

            (stem, group)
        };

        // Skip duplicates (prefer new format over old)
        if seen_teams.contains(&team_id) {
            continue;
        }
        seen_teams.insert(team_id.clone());

        teams.push((team_id, group, relative_str));
    }

    Ok(teams)
}

/// Map directory group to department/pillar ID
fn group_to_pillar(group: &str) -> Option<String> {
    match group {
        // Legacy pillar mapping
        "pillar_1" => Some("organizational-intelligence".to_string()),
        "pillar_2" => Some("autonomous-operations".to_string()),
        "pillar_3" => Some("human-ai-collaboration".to_string()),
        // New department structure
        "adm_admin" => Some("admin".to_string()),
        "hr_human_resources" => Some("human-resources".to_string()),
        "dev_development" => Some("development".to_string()),
        "inf_infrastructure" => Some("infrastructure".to_string()),
        "biz_business" => Some("business".to_string()),
        "qa_quality" => Some("quality-assurance".to_string()),
        // For any other directory, use its name as the pillar
        "" => None,
        other => Some(other.replace("_", "-")),
    }
}

/// List all available team configurations (backward compatible - returns just IDs)
#[tauri::command]
pub async fn list_teams() -> Result<Vec<String>, String> {
    // Backward compatible: return just team IDs
    let infos = list_teams_info().await?;
    Ok(infos.into_iter().map(|t| t.id).collect())
}

/// List all teams with full metadata (new endpoint for hierarchical display)
#[tauri::command]
pub async fn list_teams_info() -> Result<Vec<TeamInfo>, String> {
    let teams_dir = crate::utils::paths::get_teams_dir()?;

    if !teams_dir.exists() {
        return Ok(vec![]);
    }

    // Scan recursively
    let team_entries = scan_teams_recursive(&teams_dir)?;

    let mut teams: Vec<TeamInfo> = team_entries
        .into_iter()
        .map(|(id, group, path)| {
            // Try to load team name from config, fall back to id
            let name = TeamConfig::load_from_path(&teams_dir.join(&path))
                .map(|c| c.team.name.clone())
                .unwrap_or_else(|_| id.clone());

            TeamInfo {
                id: id.clone(),
                name,
                group: group.clone(),
                pillar: group_to_pillar(&group),
                path,
            }
        })
        .collect();

    // Sort: root teams first, then by group, then by id
    teams.sort_by(|a, b| match (a.group.is_empty(), b.group.is_empty()) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.group.cmp(&b.group).then(a.id.cmp(&b.id)),
    });

    Ok(teams)
}

/// Get the team name for a specific project
#[tauri::command(rename_all = "snake_case")]
pub async fn get_project_team(project_name: String) -> Result<String, String> {
    let projects_dir =
        std::env::var("PROJECTS_DIR").map_err(|_| "PROJECTS_DIR not set".to_string())?;
    let team_file = PathBuf::from(projects_dir)
        .join(&project_name)
        .join(".team");

    if team_file.exists() {
        Ok(fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read .team file: {}", e))?
            .trim()
            .to_string())
    } else {
        Ok("default".to_string())
    }
}

/// Rename a team configuration
///
/// This renames the team and updates the team name inside the YAML content.
/// For new format (teams/{team}/): renames the entire team folder
/// For old format (teams/{team}.yaml): renames the yaml file
/// Security: Validates both names to prevent path traversal attacks
/// Supports teams in subdirectories - renamed team stays in same group
#[tauri::command(rename_all = "snake_case")]
pub async fn rename_team_config(old_name: String, new_name: String) -> Result<(), String> {
    // Validate old_name doesn't contain path traversal
    if old_name.contains("..") || old_name.contains("/") || old_name.contains("\\") {
        return Err("Invalid old team name: path traversal not allowed".to_string());
    }

    // Validate new_name doesn't contain path traversal
    if new_name.contains("..") || new_name.contains("/") || new_name.contains("\\") {
        return Err("Invalid new team name: path traversal not allowed".to_string());
    }

    // Validate new name format
    if !new_name
        .chars()
        .next()
        .map(|c| c.is_ascii_lowercase())
        .unwrap_or(false)
    {
        return Err("Team name must start with a lowercase letter".to_string());
    }

    if !new_name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(
            "Team name must contain only lowercase letters, digits, and underscores".to_string(),
        );
    }

    // If names are the same, nothing to do
    if old_name == new_name {
        return Ok(());
    }

    // Check if new team already exists anywhere
    if TeamConfig::resolve_team_path(&new_name).is_ok() {
        return Err(format!("Team '{}' already exists", new_name));
    }

    // Resolve old path (checks root and subdirectories)
    let old_config_path = TeamConfig::resolve_team_path(&old_name)
        .map_err(|_| format!("Team '{}' does not exist", old_name))?;

    // Load and update the config
    let mut config = TeamConfig::load(&old_name)?;
    config.team.name = new_name.clone();

    // Serialize to YAML
    let yaml_content =
        serde_yaml::to_string(&config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    // Check if this is new format (team.yaml inside a team folder)
    let file_name = old_config_path.file_name().and_then(|s| s.to_str());
    if file_name == Some("team.yaml") {
        // New format: rename the entire team folder
        let old_team_dir = old_config_path
            .parent()
            .ok_or("Failed to get team directory")?;
        let parent_dir = old_team_dir
            .parent()
            .ok_or("Failed to get parent directory")?;
        let new_team_dir = parent_dir.join(&new_name);

        // Rename the folder
        fs::rename(old_team_dir, &new_team_dir)
            .map_err(|e| format!("Failed to rename team directory: {}", e))?;

        // Update the team.yaml file with new name
        let new_config_path = new_team_dir.join("team.yaml");
        fs::write(&new_config_path, yaml_content)
            .map_err(|e| format!("Failed to update config file: {}", e))?;
    } else {
        // Old format: just rename the yaml file
        let parent_dir = old_config_path
            .parent()
            .ok_or_else(|| "Failed to get parent directory".to_string())?;
        let new_path = parent_dir.join(format!("{}.yaml", new_name));

        // Write to new file
        fs::write(&new_path, yaml_content)
            .map_err(|e| format!("Failed to write new config file: {}", e))?;

        // Delete old file
        fs::remove_file(&old_config_path)
            .map_err(|e| format!("Failed to remove old config file: {}", e))?;
    }

    Ok(())
}

/// Set the team for a specific project
///
/// Security: Validates project name to prevent path traversal attacks (B01)
#[tauri::command(rename_all = "snake_case")]
pub async fn set_project_team(project_name: String, team_name: String) -> Result<(), String> {
    // Validate project_name doesn't contain path traversal (CRITICAL SECURITY - B01)
    if project_name.contains("..") || project_name.contains("/") || project_name.contains("\\") {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    // Verify project exists
    let projects_dir =
        std::env::var("PROJECTS_DIR").map_err(|_| "PROJECTS_DIR not set".to_string())?;
    let project_path = PathBuf::from(&projects_dir).join(&project_name);

    if !project_path.exists() || !project_path.is_dir() {
        return Err(format!("Project '{}' does not exist", project_name));
    }

    // Validate team exists by attempting to load it
    TeamConfig::load(&team_name)?;

    // Write team name to .team file
    let team_file = project_path.join(".team");
    fs::write(&team_file, team_name).map_err(|e| format!("Failed to write .team file: {}", e))?;

    Ok(())
}

/// Delete a team configuration
///
/// Security: Validates team name to prevent path traversal attacks
/// Prevents deletion of the "default" team
/// For new format (teams/{team}/): deletes entire team folder
/// For old format (teams/{team}.yaml): deletes just the yaml file
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_team(team_name: String) -> Result<(), String> {
    // Prevent deletion of the default team
    if team_name == "default" {
        return Err("Cannot delete the default team".to_string());
    }

    // Validate team_name doesn't contain path traversal
    if team_name.contains("..") || team_name.contains("/") || team_name.contains("\\") {
        return Err("Invalid team name: path traversal not allowed".to_string());
    }

    // Resolve team path (checks root and subdirectories)
    let config_path = TeamConfig::resolve_team_path(&team_name)
        .map_err(|_| format!("Team '{}' does not exist", team_name))?;

    // Check if this is new format (team.yaml inside a team folder)
    let file_name = config_path.file_name().and_then(|s| s.to_str());
    if file_name == Some("team.yaml") {
        // New format: delete the entire team folder
        let team_dir = config_path.parent().ok_or("Failed to get team directory")?;
        fs::remove_dir_all(team_dir)
            .map_err(|e| format!("Failed to delete team directory: {}", e))?;
    } else {
        // Old format: delete just the yaml file
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to delete team config file: {}", e))?;
    }

    Ok(())
}

/// Get departments configuration
/// Returns empty config if file doesn't exist (graceful fallback)
#[tauri::command]
pub async fn get_departments_config() -> Result<DepartmentsConfig, String> {
    DepartmentsConfig::load()
}

/// Save departments configuration
#[tauri::command]
pub async fn save_departments_config(config: DepartmentsConfig) -> Result<(), String> {
    config.save()
}
