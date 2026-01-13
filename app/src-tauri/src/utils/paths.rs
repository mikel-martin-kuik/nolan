use std::env;
use std::path::PathBuf;

/// Get user home directory from $HOME environment variable
/// NEVER use "~" as Rust's std::fs and Command do not expand it
pub fn get_home_dir() -> Result<PathBuf, String> {
    env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable not set".to_string())
}

/// Detect git repository root by walking up from current executable
/// Looks for .git directory
fn detect_git_root() -> Option<PathBuf> {
    // Start from current executable location
    let exe_path = env::current_exe().ok()?;
    let mut current = exe_path.as_path();

    // Walk up the directory tree (max 20 levels to prevent infinite loops)
    for _ in 0..20 {
        // Try to get parent directory
        current = current.parent()?;

        // Check if .git exists in this directory
        let git_dir = current.join(".git");
        if git_dir.exists() && git_dir.is_dir() {
            return Some(current.to_path_buf());
        }
    }

    None
}

/// Get Nolan app root directory (the app/ directory)
/// Priority:
/// 1. NOLAN_APP_ROOT environment variable
/// 2. Git repository root detection + /app
/// 3. Fallback: $HOME/nolan/app (portable, no language-specific dirs)
pub fn get_nolan_app_root() -> Result<PathBuf, String> {
    // Priority 1: Check environment variable (user override)
    if let Ok(root) = env::var("NOLAN_APP_ROOT") {
        let path = PathBuf::from(root);
        if path.exists() {
            return Ok(path);
        }
        return Err(format!(
            "NOLAN_APP_ROOT is set but path does not exist: {:?}",
            path
        ));
    }

    // Priority 2: Try git root detection (works anywhere)
    if let Some(git_root) = detect_git_root() {
        return Ok(git_root.join("app"));
    }

    // Priority 3: Generic fallback (no language-specific dirs like "Proyectos")
    Ok(get_home_dir()?.join("nolan/app"))
}

/// Get scripts directory
/// Returns: <nolan_app_root>/scripts
pub fn get_scripts_dir() -> Result<PathBuf, String> {
    let scripts = get_nolan_app_root()?.join("scripts");

    // Verify directory exists
    if !scripts.exists() {
        return Err(format!("Scripts directory not found: {:?}", scripts));
    }

    // Return canonical path (resolves symlinks, prevents traversal)
    scripts.canonicalize()
        .map_err(|e| format!("Failed to resolve scripts path: {}", e))
}

/// Get Claude history.jsonl path
/// Returns: $HOME/.claude/history.jsonl
pub fn get_history_path() -> Result<PathBuf, String> {
    Ok(get_home_dir()?.join(".claude/history.jsonl"))
}

/// Get agents directory (user data)
/// Returns: <nolan_data_root>/agents
pub fn get_agents_dir() -> Result<PathBuf, String> {
    Ok(get_nolan_data_root()?.join("agents"))
}

/// Get projects directory (user data)
/// Returns: <nolan_data_root>/projects
pub fn get_projects_dir() -> Result<PathBuf, String> {
    Ok(get_nolan_data_root()?.join("projects"))
}

/// Get roadmaps directory
/// Returns: <repo_root>/docs/roadmaps
pub fn get_roadmaps_dir() -> Result<PathBuf, String> {
    let app_root = get_nolan_app_root()?;
    let repo_root = app_root
        .parent()
        .ok_or("Cannot determine repository root from app directory")?;
    Ok(repo_root.join("docs").join("roadmaps"))
}

/// Get Nolan root directory (parent of app/)
/// Uses existing get_nolan_app_root() and navigates up one level
/// Returns: <nolan_root>
pub fn get_nolan_root() -> Result<PathBuf, String> {
    let app_root = get_nolan_app_root()?;
    app_root
        .parent()
        .ok_or("Cannot determine Nolan root")?
        .to_path_buf()
        .canonicalize()
        .map_err(|e| format!("Invalid root path: {}", e))
}

/// Get Nolan data root directory for user-specific data
/// Priority:
/// 1. NOLAN_DATA_ROOT environment variable
/// 2. Default to ~/.nolan
/// Returns: directory for user data (agents, projects, teams, .state)
pub fn get_nolan_data_root() -> Result<PathBuf, String> {
    // Priority 1: Check NOLAN_DATA_ROOT environment variable
    if let Ok(data_root) = env::var("NOLAN_DATA_ROOT") {
        let path = PathBuf::from(&data_root);
        if path.exists() {
            return Ok(path);
        }
        // Create if doesn't exist (first run with new var)
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create NOLAN_DATA_ROOT: {}", e))?;
        return Ok(path);
    }

    // Priority 2: Default to ~/.nolan
    let default_path = get_home_dir()?.join(".nolan");
    if !default_path.exists() {
        std::fs::create_dir_all(&default_path)
            .map_err(|e| format!("Failed to create ~/.nolan: {}", e))?;
    }
    Ok(default_path)
}

/// Get the consolidated state directory path (user data)
/// Returns: <nolan_data_root>/.state
pub fn get_state_dir() -> Result<PathBuf, String> {
    Ok(get_nolan_data_root()?.join(".state"))
}

/// Get the scheduler state directory (user data)
/// Returns: <nolan_data_root>/.state/scheduler
pub fn get_scheduler_state_dir() -> Result<PathBuf, String> {
    Ok(get_state_dir()?.join("scheduler"))
}

/// Get the handoffs directory (user data)
/// Returns: <nolan_data_root>/.state/handoffs
pub fn get_handoffs_dir() -> Result<PathBuf, String> {
    Ok(get_state_dir()?.join("handoffs"))
}

/// Get the feedback directory for support/feature requests (user data)
/// Returns: <nolan_data_root>/.state/feedback
pub fn get_feedback_dir() -> Result<PathBuf, String> {
    Ok(get_state_dir()?.join("feedback"))
}

/// Get teams directory (user data)
/// Returns: <nolan_data_root>/teams
pub fn get_teams_dir() -> Result<PathBuf, String> {
    Ok(get_nolan_data_root()?.join("teams"))
}

/// Get a specific team's directory
/// Returns: <nolan_data_root>/teams/{team_name}/
pub fn get_team_dir(team_name: &str) -> Result<PathBuf, String> {
    Ok(get_teams_dir()?.join(team_name))
}

/// Get a team's agents directory
/// Returns: <nolan_data_root>/teams/{team_name}/agents/
pub fn get_team_agents_dir(team_name: &str) -> Result<PathBuf, String> {
    Ok(get_team_dir(team_name)?.join("agents"))
}

/// Get path to a team's config file (new format)
/// Returns: <nolan_data_root>/teams/{team_name}/team.yaml
pub fn get_team_config_path(team_name: &str) -> Result<PathBuf, String> {
    Ok(get_team_dir(team_name)?.join("team.yaml"))
}

/// Get cronos runs directory (user data - execution logs)
/// Returns: <nolan_data_root>/cronos/runs
pub fn get_cronos_runs_dir() -> Result<PathBuf, String> {
    Ok(get_nolan_data_root()?.join("cronos").join("runs"))
}

/// Get the agent's working directory (target repository)
/// Priority:
/// 1. AGENT_WORK_ROOT environment variable
/// 2. Falls back to current working directory
/// Returns: directory where the agent should operate on files
pub fn get_agent_work_root() -> Result<PathBuf, String> {
    if let Ok(root) = env::var("AGENT_WORK_ROOT") {
        let path = PathBuf::from(root);
        if path.exists() {
            return Ok(path);
        }
    }
    // Fallback to current working directory
    env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))
}

/// Get path to deployment manifest file
/// Returns: <nolan_data_root>/.state/deployments.jsonl
pub fn get_deployments_path() -> Result<PathBuf, String> {
    Ok(get_state_dir()?.join("deployments.jsonl"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_paths_do_not_use_tilde() {
        // Verify no paths contain ~ character
        let home = get_home_dir().unwrap();
        assert!(!home.to_string_lossy().contains("~"));

        let app_root = get_nolan_app_root().unwrap();
        assert!(!app_root.to_string_lossy().contains("~"));

        let history = get_history_path().unwrap();
        assert!(!history.to_string_lossy().contains("~"));
    }

    #[test]
    fn test_paths_are_absolute() {
        let home = get_home_dir().unwrap();
        assert!(home.is_absolute());

        let app_root = get_nolan_app_root().unwrap();
        assert!(app_root.is_absolute());
    }
}
