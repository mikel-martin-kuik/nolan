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
