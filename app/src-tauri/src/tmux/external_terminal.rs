//! External terminal detection and launching
//!
//! Platform-specific terminal emulator detection and launching with secure session name handling.
//!
//! Security: Session names are validated and escaped before being interpolated into
//! shell commands to prevent command injection.

use std::process::Command;
use crate::constants::{RE_CORE_AGENT, RE_RALPH_SESSION};

/// Terminal emulator types supported by the platform
#[derive(Debug, Clone, Copy)]
pub enum TerminalType {
    /// GNOME Terminal (Linux)
    GnomeTerminal,
    /// macOS default Terminal.app
    MacOSTerminal,
    /// iTerm2 for macOS
    ITerm2,
}

/// Detect available terminal emulator for current platform
///
/// Returns None if no compatible terminal emulator is found.
pub fn detect_terminal() -> Option<TerminalType> {
    #[cfg(target_os = "linux")]
    {
        // Check for gnome-terminal
        if Command::new("which")
            .arg("gnome-terminal")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(TerminalType::GnomeTerminal);
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Check for iTerm2 first (preferred) - check if installed, not if running
        if std::path::Path::new("/Applications/iTerm.app").exists() {
            return Some(TerminalType::ITerm2);
        }

        // Fallback to Terminal.app (always available on macOS)
        return Some(TerminalType::MacOSTerminal);
    }

    None
}

/// 🔒 SECURITY: Escape AppleScript string to prevent command injection
///
/// Escapes backslashes and quotes in strings to be interpolated into AppleScript.
/// This is critical for preventing command injection when session names are passed
/// to AppleScript commands.
///
/// # Example
/// ```
/// assert_eq!(escape_applescript_string("test"), "test");
/// assert_eq!(escape_applescript_string("te\"st"), "te\\\"st");
/// assert_eq!(escape_applescript_string("te\\st"), "te\\\\st");
/// ```
fn escape_applescript_string(s: &str) -> String {
    s.replace("\\", "\\\\").replace("\"", "\\\"")
}

/// 🔒 SECURITY: Validate session name format (defense-in-depth)
///
/// Session names must match one of:
/// - Team sessions: agent-{team}-{name} (team and agent names use underscores, hyphens are delimiters)
/// - Ralph sessions: agent-ralph-{name}
///
/// This revalidates even though the caller should have already validated.
/// This is a security boundary to prevent command injection in shell commands.
/// Uses centralized patterns from constants.rs.
fn validate_session_format(session: &str) -> Result<(), String> {
    // Use centralized patterns from constants.rs
    if RE_CORE_AGENT.is_match(session) || RE_RALPH_SESSION.is_match(session) {
        return Ok(());
    }

    Err(format!(
        "Invalid session name format: '{}'. Expected: agent-{{team}}-{{name}} or agent-ralph-{{name}}",
        session
    ))
}

/// Launch external terminal for a tmux session
///
/// # Security
/// Session names are validated and escaped before being used in shell commands
/// to prevent command injection attacks.
///
/// # Arguments
/// * `terminal_type` - The type of terminal to launch
/// * `session` - The tmux session name (will be validated)
/// * `title` - Optional window title (defaults to session name)
///
/// # Returns
/// Ok(()) on success, Err with error message on failure
pub fn launch_external_terminal(
    terminal_type: TerminalType,
    session: &str,
    title: Option<&str>,
) -> Result<(), String> {
    // 🔒 SECURITY: Validate session format (defense-in-depth)
    validate_session_format(session)?;

    let window_title = title.unwrap_or(session);

    match terminal_type {
        TerminalType::GnomeTerminal => {
            // Launch gnome-terminal with tmux attach command
            // Session name is passed as separate argument, safe from shell injection
            Command::new("gnome-terminal")
                .arg("--title")
                .arg(window_title)
                .arg("--")
                .arg("tmux")
                .arg("attach")
                .arg("-t")
                .arg(session)
                .spawn()
                .map_err(|e| format!("Failed to launch gnome-terminal: {}", e))?;
        }

        TerminalType::MacOSTerminal => {
            // 🔒 SECURITY: Escape session name for AppleScript
            let escaped_session = escape_applescript_string(session);

            let script = format!(
                r#"tell application "Terminal"
    activate
    do script "tmux attach -t {}"
end tell"#,
                escaped_session
            );

            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .spawn()
                .map_err(|e| format!("Failed to launch Terminal.app: {}", e))?;
        }

        TerminalType::ITerm2 => {
            // 🔒 SECURITY: Escape session name for AppleScript
            let escaped_session = escape_applescript_string(session);

            let script = format!(
                r#"tell application "iTerm"
    activate
    create window with default profile command "tmux attach -t {}"
end tell"#,
                escaped_session
            );

            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .spawn()
                .map_err(|e| format!("Failed to launch iTerm2: {}", e))?;
        }
    }

    Ok(())
}

/// Get a human-readable name for a terminal type
pub fn terminal_type_name(terminal_type: TerminalType) -> &'static str {
    match terminal_type {
        TerminalType::GnomeTerminal => "GNOME Terminal",
        TerminalType::MacOSTerminal => "Terminal.app",
        TerminalType::ITerm2 => "iTerm2",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_applescript_string() {
        assert_eq!(escape_applescript_string("normal"), "normal");
        assert_eq!(escape_applescript_string("with\"quote"), "with\\\"quote");
        assert_eq!(escape_applescript_string("with\\backslash"), "with\\\\backslash");
        assert_eq!(
            escape_applescript_string("both\"and\\"),
            "both\\\"and\\\\"
        );
    }

    #[test]
    fn test_validate_session_format() {
        // Valid formats
        assert!(validate_session_format("agent-ana").is_ok());
        assert!(validate_session_format("agent-bill").is_ok());
        assert!(validate_session_format("agent-carl").is_ok());
        assert!(validate_session_format("agent-dan-1").is_ok());
        assert!(validate_session_format("agent-enzo-42").is_ok());

        // Invalid formats
        assert!(validate_session_format("agent").is_err());
        assert!(validate_session_format("agent-").is_err());
        assert!(validate_session_format("Agent-Bill").is_err()); // uppercase
        assert!(validate_session_format("agent-bill-").is_err()); // trailing dash
        assert!(validate_session_format("agent-bill-abc").is_err()); // non-numeric suffix
        assert!(validate_session_format("not-agent-bill").is_err());
        assert!(validate_session_format("agent-bill; rm -rf /").is_err()); // injection attempt
    }

    #[test]
    fn test_terminal_type_name() {
        assert_eq!(terminal_type_name(TerminalType::GnomeTerminal), "GNOME Terminal");
        assert_eq!(terminal_type_name(TerminalType::MacOSTerminal), "Terminal.app");
        assert_eq!(terminal_type_name(TerminalType::ITerm2), "iTerm2");
    }
}
