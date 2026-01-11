use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;
use crate::config::{TeamConfig, DepartmentsConfig, TeamInfo};

/// Get team configuration by name
#[tauri::command]
pub async fn get_team_config(team_name: String) -> Result<TeamConfig, String> {
    TeamConfig::load(&team_name)
}

/// Save team configuration to file
///
/// Security: Validates team name to prevent path traversal attacks
#[tauri::command]
pub async fn save_team_config(team_name: String, config: TeamConfig) -> Result<(), String> {
    // Validate team_name doesn't contain path traversal
    if team_name.contains("..") || team_name.contains("/") || team_name.contains("\\") {
        return Err("Invalid team name: path traversal not allowed".to_string());
    }

    // Validate team name format
    if !team_name.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
        return Err("Team name must start with a lowercase letter".to_string());
    }

    if !team_name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("Team name must contain only lowercase letters, digits, and underscores".to_string());
    }

    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set".to_string())?;
    let teams_dir = PathBuf::from(nolan_root).join("teams");

    // Ensure teams directory exists
    if !teams_dir.exists() {
        fs::create_dir_all(&teams_dir)
            .map_err(|e| format!("Failed to create teams directory: {}", e))?;
    }

    let config_path = teams_dir.join(format!("{}.yaml", team_name));

    // Serialize to YAML
    let yaml_content = serde_yaml::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    // Write to file
    fs::write(&config_path, yaml_content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

/// Recursively scan a directory for team YAML files
/// Returns tuples of (team_id, group, relative_path)
fn scan_teams_recursive(teams_dir: &std::path::Path) -> Result<Vec<(String, String, String)>, String> {
    let mut teams = Vec::new();

    for entry in WalkDir::new(teams_dir)
        .max_depth(2)  // Root (depth 0), immediate children dirs (depth 1), files in subdirs (depth 2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Skip directories and non-yaml files
        if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("yaml") {
            continue;
        }

        // Skip departments.yaml
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if stem == "departments" {
                continue;
            }

            // Get relative path from teams_dir
            let relative = path.strip_prefix(teams_dir)
                .map_err(|_| "Failed to get relative path")?;

            // Determine group (parent directory name, or "" for root)
            let group = relative.parent()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();

            let relative_str = relative.to_str()
                .ok_or("Invalid path encoding")?
                .to_string();

            teams.push((stem.to_string(), group, relative_str));
        }
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
    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set".to_string())?;
    let teams_dir = PathBuf::from(nolan_root).join("teams");

    if !teams_dir.exists() {
        return Ok(vec![]);
    }

    // Scan recursively
    let team_entries = scan_teams_recursive(&teams_dir)?;

    let mut teams: Vec<TeamInfo> = team_entries.into_iter()
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
    teams.sort_by(|a, b| {
        match (a.group.is_empty(), b.group.is_empty()) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.group.cmp(&b.group).then(a.id.cmp(&b.id)),
        }
    });

    Ok(teams)
}

/// Get the team name for a specific project
#[tauri::command]
pub async fn get_project_team(project_name: String) -> Result<String, String> {
    let projects_dir = std::env::var("PROJECTS_DIR")
        .map_err(|_| "PROJECTS_DIR not set".to_string())?;
    let team_file = PathBuf::from(projects_dir).join(&project_name).join(".team");

    if team_file.exists() {
        Ok(fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read .team file: {}", e))?
            .trim()
            .to_string())
    } else {
        Ok("default".to_string())
    }
}

/// Rename a team configuration file
///
/// This renames both the file and updates the team name inside the YAML content.
/// Security: Validates both names to prevent path traversal attacks
/// Supports teams in subdirectories - renamed team stays in same directory
#[tauri::command]
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
    if !new_name.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
        return Err("Team name must start with a lowercase letter".to_string());
    }

    if !new_name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("Team name must contain only lowercase letters, digits, and underscores".to_string());
    }

    // If names are the same, nothing to do
    if old_name == new_name {
        return Ok(());
    }

    // Resolve old path (checks root and subdirectories)
    let old_path = TeamConfig::resolve_team_path(&old_name)
        .map_err(|_| format!("Team '{}' does not exist", old_name))?;

    // New path should be in the same directory as old path (keep team in its pillar)
    let parent_dir = old_path.parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?;
    let new_path = parent_dir.join(format!("{}.yaml", new_name));

    // Check new file doesn't already exist (in same directory or anywhere)
    if new_path.exists() {
        return Err(format!("Team '{}' already exists in this directory", new_name));
    }
    // Also check if team exists elsewhere
    if TeamConfig::resolve_team_path(&new_name).is_ok() {
        return Err(format!("Team '{}' already exists", new_name));
    }

    // Load the config, update the name, and save to new location
    let mut config = TeamConfig::load(&old_name)?;
    config.team.name = new_name.clone();

    // Serialize to YAML
    let yaml_content = serde_yaml::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    // Write to new file
    fs::write(&new_path, yaml_content)
        .map_err(|e| format!("Failed to write new config file: {}", e))?;

    // Delete old file
    fs::remove_file(&old_path)
        .map_err(|e| format!("Failed to remove old config file: {}", e))?;

    Ok(())
}

/// Set the team for a specific project
///
/// Security: Validates project name to prevent path traversal attacks (B01)
#[tauri::command]
pub async fn set_project_team(project_name: String, team_name: String) -> Result<(), String> {
    // Validate project_name doesn't contain path traversal (CRITICAL SECURITY - B01)
    if project_name.contains("..") || project_name.contains("/") || project_name.contains("\\") {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    // Verify project exists
    let projects_dir = std::env::var("PROJECTS_DIR")
        .map_err(|_| "PROJECTS_DIR not set".to_string())?;
    let project_path = PathBuf::from(&projects_dir).join(&project_name);

    if !project_path.exists() || !project_path.is_dir() {
        return Err(format!("Project '{}' does not exist", project_name));
    }

    // Validate team exists by attempting to load it
    TeamConfig::load(&team_name)?;

    // Write team name to .team file
    let team_file = project_path.join(".team");
    fs::write(&team_file, team_name)
        .map_err(|e| format!("Failed to write .team file: {}", e))?;

    Ok(())
}

/// Delete a team configuration file
///
/// Security: Validates team name to prevent path traversal attacks
/// Prevents deletion of the "default" team
/// Supports teams in subdirectories (pillar_1/, pillar_2/, etc.)
#[tauri::command]
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

    // Delete the file
    fs::remove_file(&config_path)
        .map_err(|e| format!("Failed to delete team config file: {}", e))?;

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
