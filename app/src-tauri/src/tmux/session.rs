use std::process::Command;

/// List all tmux sessions
pub fn list_sessions() -> Result<Vec<String>, String> {
    let output = Command::new("tmux")
        .args(&["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| format!("Failed to list sessions: {}", e))?;

    if !output.status.success() {
        // No sessions running (tmux returns error if no server is running)
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|s| s.to_string()).collect())
}

/// Check if a tmux session exists
pub fn session_exists(session: &str) -> Result<bool, String> {
    let output = Command::new("tmux")
        .args(&["has-session", "-t", session])
        .output()
        .map_err(|e| format!("Failed to check session: {}", e))?;

    Ok(output.status.success())
}

/// Kill a tmux session
pub fn kill_session(session: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(&["kill-session", "-t", session])
        .output()
        .map_err(|e| format!("Failed to kill session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to kill session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Get session info (for checking if attached and creation time)
pub struct SessionInfo {
    pub attached: bool,
    pub created_at: u64,  // Unix timestamp in seconds
}

pub fn get_session_info(session: &str) -> Result<SessionInfo, String> {
    let output = Command::new("tmux")
        .args(&["list-sessions", "-F", "#{session_name} #{session_attached} #{session_created}"])
        .output()
        .map_err(|e| format!("Failed to get session info: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get session info".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 && parts[0] == session {
            let attached = parts[1] == "1";
            let created_at = parts[2].parse::<u64>()
                .unwrap_or_else(|_| std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0));
            return Ok(SessionInfo { attached, created_at });
        }
    }

    Err(format!("Session '{}' not found", session))
}
