use std::fs;
use std::path::PathBuf;
use crate::config::TeamConfig;

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

    if !team_name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Team name must contain only lowercase letters, digits, and hyphens".to_string());
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

/// List all available team configurations
#[tauri::command]
pub async fn list_teams() -> Result<Vec<String>, String> {
    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set".to_string())?;
    let teams_dir = PathBuf::from(nolan_root).join("teams");

    if !teams_dir.exists() {
        return Ok(vec![]); // Return empty list if teams directory doesn't exist yet
    }

    let mut teams = Vec::new();
    for entry in fs::read_dir(&teams_dir)
        .map_err(|e| format!("Failed to read teams directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                teams.push(name.to_string());
            }
        }
    }

    // Sort alphabetically
    teams.sort();

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

    if !new_name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Team name must contain only lowercase letters, digits, and hyphens".to_string());
    }

    // If names are the same, nothing to do
    if old_name == new_name {
        return Ok(());
    }

    let nolan_root = std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT not set".to_string())?;
    let teams_dir = PathBuf::from(nolan_root).join("teams");

    let old_path = teams_dir.join(format!("{}.yaml", old_name));
    let new_path = teams_dir.join(format!("{}.yaml", new_name));

    // Check old file exists
    if !old_path.exists() {
        return Err(format!("Team '{}' does not exist", old_name));
    }

    // Check new file doesn't already exist
    if new_path.exists() {
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
