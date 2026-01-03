use std::process::Command;

/// List all active tmux sessions
pub fn list_sessions() -> Result<Vec<String>, String> {
    let output = Command::new("tmux")
        .args(&["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| format!("Failed to list sessions: {}", e))?;

    if output.status.success() {
        let sessions = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect();
        Ok(sessions)
    } else {
        // Empty result if no sessions (tmux returns error when no sessions exist)
        if String::from_utf8_lossy(&output.stderr).contains("no server running") {
            Ok(Vec::new())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

/// Check if a specific tmux session exists
pub fn session_exists(session_name: &str) -> Result<bool, String> {
    let output = Command::new("tmux")
        .args(&["has-session", "-t", session_name])
        .output()
        .map_err(|e| format!("Failed to check session: {}", e))?;

    Ok(output.status.success())
}

/// Send literal text to a tmux session (SECURITY: uses -l flag)
pub fn send_keys_literal(session_name: &str, text: &str) -> Result<(), String> {
    // Send the text literally (no command interpretation)
    let output = Command::new("tmux")
        .arg("send-keys")
        .arg("-t")
        .arg(session_name)
        .arg("-l")  // CRITICAL: Literal mode - prevents command injection
        .arg(text)
        .output()
        .map_err(|e| format!("Failed to send keys: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux send-keys failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Send Enter key separately
    let enter_output = Command::new("tmux")
        .arg("send-keys")
        .arg("-t")
        .arg(session_name)
        .arg("C-m")  // Carriage return (Enter)
        .output()
        .map_err(|e| format!("Failed to send Enter: {}", e))?;

    if !enter_output.status.success() {
        return Err(format!(
            "tmux send Enter failed: {}",
            String::from_utf8_lossy(&enter_output.stderr)
        ));
    }

    Ok(())
}

/// Get detailed information about a session
pub fn get_session_info(session_name: &str) -> Result<SessionInfo, String> {
    let output = Command::new("tmux")
        .args(&[
            "list-sessions",
            "-F",
            "#{session_name}|#{session_attached}|#{session_created}|#{session_windows}",
            "-f",
            &format!("#{session_name} == {}", session_name),
        ])
        .output()
        .map_err(|e| format!("Failed to get session info: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Session '{}' not found",
            session_name
        ));
    }

    let info_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = info_str.trim().split('|').collect();

    if parts.len() < 4 {
        return Err("Invalid session info format".to_string());
    }

    Ok(SessionInfo {
        name: parts[0].to_string(),
        attached: parts[1] == "1",
        created: parts[2].parse().unwrap_or(0),
        windows: parts[3].parse().unwrap_or(0),
    })
}

/// Kill a tmux session
pub fn kill_session(session_name: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(&["kill-session", "-t", session_name])
        .output()
        .map_err(|e| format!("Failed to kill session: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to kill session '{}': {}",
            session_name,
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Session information structure
#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub name: String,
    pub attached: bool,
    pub created: u64,
    pub windows: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_sessions_no_error_when_no_tmux() {
        // This should not panic, just return an error or empty list
        let result = list_sessions();
        // We don't assert on result because tmux may or may not be available
        // Just ensure it doesn't panic
        let _ = result;
    }

    #[test]
    fn test_session_exists_false_for_nonexistent() {
        // Assuming a session named "nonexistent-session-12345" doesn't exist
        let result = session_exists("nonexistent-session-12345");
        if let Ok(exists) = result {
            assert!(!exists);
        }
        // If error, tmux might not be available, which is fine for testing
    }
}
