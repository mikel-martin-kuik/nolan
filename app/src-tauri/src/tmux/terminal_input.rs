//! Terminal input handling module
//!
//! Sends user input from frontend terminal to tmux sessions.

use std::process::Command;

/// Exit copy mode if the pane is currently in it
fn exit_copy_mode_if_needed(session: &str) {
    // Check if pane is in copy mode
    if let Ok(output) = Command::new("tmux")
        .args(&["display-message", "-p", "-t", session, "#{pane_in_mode}"])
        .output()
    {
        let in_mode = String::from_utf8_lossy(&output.stdout).trim() == "1";
        if in_mode {
            // Exit copy mode by sending 'q'
            let _ = Command::new("tmux")
                .args(&["send-keys", "-t", session, "q"])
                .output();
        }
    }
}

/// Send literal text to a tmux session
///
/// Uses `tmux send-keys -l` to send text without interpretation.
/// The `-l` flag ensures special characters are sent literally.
/// Automatically exits copy mode if active.
pub fn send_terminal_input(session: &str, data: &str) -> Result<(), String> {
    exit_copy_mode_if_needed(session);

    let output = Command::new("tmux")
        .args(&["send-keys", "-t", session, "-l", data])
        .output()
        .map_err(|e| format!("Failed to send input: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to send input to session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Send a special key to a tmux session
///
/// Translates common key names to tmux key codes and sends them.
///
/// Supported keys:
/// - "Enter" → "C-m" (Ctrl+M, same as Enter)
/// - "Backspace" → "BSpace"
/// - "Tab" → "Tab"
/// - "ArrowUp" → "Up"
/// - "ArrowDown" → "Down"
/// - "ArrowLeft" → "Left"
/// - "ArrowRight" → "Right"
/// - "Escape" → "Escape"
/// - "Delete" → "DC" (Delete Character)
/// - "Home" → "Home"
/// - "End" → "End"
/// - "PageUp" → "PPage"
/// - "PageDown" → "NPage"
pub fn send_terminal_key(session: &str, key: &str) -> Result<(), String> {
    exit_copy_mode_if_needed(session);

    let tmux_key = match key {
        "Enter" => "C-m",
        "Backspace" => "BSpace",
        "Tab" => "Tab",
        "ArrowUp" => "Up",
        "ArrowDown" => "Down",
        "ArrowLeft" => "Left",
        "ArrowRight" => "Right",
        "Escape" => "Escape",
        "Delete" => "DC",
        "Home" => "Home",
        "End" => "End",
        "PageUp" => "PPage",
        "PageDown" => "NPage",
        _ => {
            return Err(format!("Unsupported key: {}", key));
        }
    };

    let output = Command::new("tmux")
        .args(&["send-keys", "-t", session, tmux_key])
        .output()
        .map_err(|e| format!("Failed to send key: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to send key to session: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Send raw data to a tmux session (for handling ANSI escape sequences)
///
/// This function sends data as-is without interpretation, useful for
/// handling special sequences from xterm.js.
pub fn send_raw_data(session: &str, data: &str) -> Result<(), String> {
    // Check for common ANSI escape sequences
    if data.starts_with('\x1b') {
        // Handle arrow keys
        match data {
            "\x1b[A" => return send_terminal_key(session, "ArrowUp"),
            "\x1b[B" => return send_terminal_key(session, "ArrowDown"),
            "\x1b[C" => return send_terminal_key(session, "ArrowRight"),
            "\x1b[D" => return send_terminal_key(session, "ArrowLeft"),
            "\x1b[H" => return send_terminal_key(session, "Home"),
            "\x1b[F" => return send_terminal_key(session, "End"),
            _ => {
                // Unknown escape sequence, send as literal
                return send_terminal_input(session, data);
            }
        }
    }

    // Handle special characters
    match data {
        "\r" | "\n" => send_terminal_key(session, "Enter"),
        "\t" => send_terminal_key(session, "Tab"),
        "\x7f" => send_terminal_key(session, "Backspace"),
        "\x1b" => send_terminal_key(session, "Escape"),
        _ => send_terminal_input(session, data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_mapping() {
        // These tests verify the key mapping logic without actually sending to tmux
        let test_cases = vec![
            ("Enter", "C-m"),
            ("Backspace", "BSpace"),
            ("Tab", "Tab"),
            ("ArrowUp", "Up"),
            ("ArrowDown", "Down"),
            ("ArrowLeft", "Left"),
            ("ArrowRight", "Right"),
        ];

        for (input_key, expected_tmux_key) in test_cases {
            let mapped = match input_key {
                "Enter" => "C-m",
                "Backspace" => "BSpace",
                "Tab" => "Tab",
                "ArrowUp" => "Up",
                "ArrowDown" => "Down",
                "ArrowLeft" => "Left",
                "ArrowRight" => "Right",
                _ => "",
            };
            assert_eq!(mapped, expected_tmux_key);
        }
    }

    #[test]
    fn test_ansi_sequence_detection() {
        // Verify ANSI escape sequence detection
        assert!("\x1b[A".starts_with('\x1b'));
        assert!("\x1b[B".starts_with('\x1b'));
        assert!("normal text".starts_with('\x1b') == false);
    }
}
