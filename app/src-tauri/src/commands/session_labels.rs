//! Session label management for Ralph agent instances
//!
//! Allows users to assign custom labels (like "nolan", "royme") to Ralph sessions
//! for easier identification. Labels are stored in memory and persist until the agent
//! is killed. The tmux window title is updated to reflect the custom label.

use std::collections::HashMap;
use std::process::Command;
use std::sync::RwLock;
use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::constants::RE_RALPH_SESSION;

/// In-memory storage for session labels
/// Labels persist until the agent is killed (as per user requirement)
static SESSION_LABELS: Lazy<RwLock<HashMap<String, String>>> = Lazy::new(|| {
    RwLock::new(HashMap::new())
});

/// Response for get_session_label command
#[derive(Serialize)]
pub struct SessionLabelResponse {
    pub session: String,
    pub label: Option<String>,
}

/// Response for list_session_labels command
#[derive(Serialize)]
pub struct SessionLabelsListResponse {
    pub labels: HashMap<String, String>,
}

/// Set a custom label for a Ralph session
/// Updates both the in-memory store and the tmux window title
#[tauri::command]
pub async fn set_session_label(
    app_handle: AppHandle,
    session: String,
    label: String,
) -> Result<String, String> {
    // Validate this is a Ralph session (only Ralph can have custom labels)
    if !RE_RALPH_SESSION.is_match(&session) {
        return Err(format!(
            "Only Ralph sessions can have custom labels. Session '{}' is not a Ralph session.",
            session
        ));
    }

    // Verify the session exists
    if !crate::tmux::session::session_exists(&session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Validate label (non-empty, reasonable length, no special chars that break tmux)
    let label = label.trim().to_string();
    if label.is_empty() {
        return Err("Label cannot be empty".to_string());
    }
    if label.len() > 30 {
        return Err("Label must be 30 characters or less".to_string());
    }
    // Allow alphanumeric, spaces, hyphens, and underscores only
    if !label.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_') {
        return Err("Label can only contain letters, numbers, spaces, hyphens, and underscores".to_string());
    }

    // Store label in memory
    {
        let mut labels = SESSION_LABELS.write()
            .map_err(|_| "Failed to acquire write lock for session labels")?;
        labels.insert(session.clone(), label.clone());
    }

    // Update tmux window title to show the custom label
    // Format: "ralph: {label}" to maintain context while showing custom name
    let window_title = format!("ralph: {}", label);
    let output = Command::new("tmux")
        .args(&["rename-window", "-t", &session, &window_title])
        .output()
        .map_err(|e| format!("Failed to update tmux window title: {}", e))?;

    if !output.status.success() {
        // Non-fatal - label is stored, just window title failed
        eprintln!(
            "Warning: Failed to update tmux window title for {}: {}",
            session,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // Emit event so UI updates
    let _ = app_handle.emit("session-label-changed", serde_json::json!({
        "session": session,
        "label": label,
    }));

    Ok(format!("Set label '{}' for session '{}'", label, session))
}

/// Get the custom label for a session (if any)
#[tauri::command]
pub async fn get_session_label(session: String) -> Result<SessionLabelResponse, String> {
    let label = {
        let labels = SESSION_LABELS.read()
            .map_err(|_| "Failed to acquire read lock for session labels")?;
        labels.get(&session).cloned()
    };

    Ok(SessionLabelResponse { session, label })
}

/// Get all session labels
#[tauri::command]
pub async fn list_session_labels() -> Result<SessionLabelsListResponse, String> {
    let labels = {
        let labels = SESSION_LABELS.read()
            .map_err(|_| "Failed to acquire read lock for session labels")?;
        labels.clone()
    };

    Ok(SessionLabelsListResponse { labels })
}

/// Remove a session's custom label (restores default tmux title)
#[tauri::command]
pub async fn clear_session_label(
    app_handle: AppHandle,
    session: String,
) -> Result<String, String> {
    // Remove from memory
    let had_label = {
        let mut labels = SESSION_LABELS.write()
            .map_err(|_| "Failed to acquire write lock for session labels")?;
        labels.remove(&session).is_some()
    };

    if !had_label {
        return Ok(format!("Session '{}' had no custom label", session));
    }

    // Restore default tmux window title (just the session name)
    // Note: tmux may have already renamed the window, so we restore to session name
    if crate::tmux::session::session_exists(&session).unwrap_or(false) {
        let _ = Command::new("tmux")
            .args(&["rename-window", "-t", &session, &session])
            .output();
    }

    // Emit event so UI updates
    let _ = app_handle.emit("session-label-changed", serde_json::json!({
        "session": session,
        "label": serde_json::Value::Null,
    }));

    Ok(format!("Cleared label for session '{}'", session))
}

/// Internal: Clear label when a session is killed
/// Called from kill_instance to clean up labels for terminated sessions
pub fn on_session_killed(session: &str) {
    if let Ok(mut labels) = SESSION_LABELS.write() {
        labels.remove(session);
    }
}

/// Internal: Clear all labels for Ralph sessions (used by kill_all_instances)
pub fn clear_all_ralph_labels() {
    if let Ok(mut labels) = SESSION_LABELS.write() {
        // Remove only Ralph session labels
        labels.retain(|session, _| !RE_RALPH_SESSION.is_match(session));
    }
}
