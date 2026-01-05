pub mod lifecycle;
pub mod communicator;
pub mod history;
pub mod sessions;
pub mod projects;

// Whitelist of allowed scripts (add more as needed)
const ALLOWED_SCRIPTS: &[&str] = &[
    "launch-core.sh",
    "kill-core.sh",
    "spawn-agent.sh",
    "lifecycle-manager.sh",
    "communicator-ui.sh",
    "tail-history.sh",
];

/// Execute a script with security validation
#[tauri::command]
pub async fn execute_script(script_name: String, args: Vec<String>) -> Result<String, String> {
    // 1. Validate script name against whitelist
    if !ALLOWED_SCRIPTS.contains(&script_name.as_str()) {
        return Err(format!(
            "Script '{}' is not allowed. Allowed scripts: {:?}",
            script_name, ALLOWED_SCRIPTS
        ));
    }

    // 2. Get and validate scripts directory
    let scripts_dir = crate::utils::paths::get_scripts_dir()?;
    let script_path = scripts_dir.join(&script_name);

    // 3. CRITICAL: Ensure resolved path is still within scripts directory
    //    This prevents path traversal attacks (e.g., "../../../etc/passwd")
    let canonical_path = script_path
        .canonicalize()
        .map_err(|e| format!("Script not found: {}", e))?;

    if !canonical_path.starts_with(&scripts_dir) {
        return Err(format!(
            "Security violation: Path traversal detected in '{}'",
            script_name
        ));
    }

    // 4. Verify script file exists and is executable
    if !canonical_path.exists() {
        return Err(format!("Script '{}' does not exist", script_name));
    }

    // 5. Execute script with validated path
    let output = crate::shell::executor::execute_script(&canonical_path, &args)?;

    if output.success {
        Ok(output.stdout)
    } else {
        Err(output.user_message())
    }
}

/// List all tmux sessions
#[tauri::command]
pub async fn list_sessions() -> Result<Vec<String>, String> {
    crate::tmux::session::list_sessions()
}

/// Check if a tmux session exists
#[tauri::command]
pub async fn session_exists(session_name: String) -> Result<bool, String> {
    crate::tmux::session::session_exists(&session_name)
}
