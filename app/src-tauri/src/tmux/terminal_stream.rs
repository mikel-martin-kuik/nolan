//! Terminal output streaming module
//!
//! Streams tmux pane output to frontend in real-time using Named Pipes (FIFO).
//!
//! Security: Pipe files are created with restricted permissions (0700 for directory,
//! 0600 for FIFOs) to prevent other users from reading sensitive terminal output.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tauri::{AppHandle, Emitter};
use serde::Serialize;

/// Directory where terminal stream pipes are stored
const STREAM_DIR: &str = "/tmp/nolan-streams";

/// Terminal output event payload
#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub session: String,
    pub data: String,
    pub timestamp: i64,
}

/// Manages active terminal stream tasks
pub struct TerminalStreamManager {
    /// Maps session name to its stream task handle
    active_streams: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
}

impl TerminalStreamManager {
    /// Create a new terminal stream manager
    pub fn new() -> Self {
        Self {
            active_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start streaming terminal output for a session
    ///
    /// Creates a named pipe (FIFO) with secure permissions and spawns an async task
    /// to read from it and emit events to the frontend.
    ///
    /// # Security
    /// - Creates `/tmp/nolan-streams/` with permissions 0700 (owner-only access)
    /// - Creates FIFO with permissions 0600 (owner-only read/write)
    /// - Prevents other users from reading sensitive terminal output
    pub async fn start_session_stream(
        &self,
        app_handle: AppHandle,
        session: &str,
    ) -> Result<(), String> {
        // 1. Create stream directory with secure permissions
        let stream_dir = PathBuf::from(STREAM_DIR);
        std::fs::create_dir_all(&stream_dir)
            .map_err(|e| format!("Failed to create stream dir: {}", e))?;

        // 🔒 SECURITY: Set directory permissions to 0700 (owner-only access)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&stream_dir)
                .map_err(|e| format!("Failed to read dir metadata: {}", e))?
                .permissions();
            perms.set_mode(0o700);
            std::fs::set_permissions(&stream_dir, perms)
                .map_err(|e| format!("Failed to set dir permissions: {}", e))?;
        }

        // 2. Create named pipe (FIFO) with secure permissions
        let pipe_path = stream_dir.join(format!("{}.pipe", session));
        let pipe_path_str = pipe_path.to_string_lossy().to_string();

        // Remove existing pipe if present
        let _ = std::fs::remove_file(&pipe_path);

        // 🔒 SECURITY: Create FIFO with 0600 permissions (owner-only read/write)
        #[cfg(unix)]
        {
            use nix::sys::stat::Mode;
            use nix::unistd::mkfifo;

            mkfifo(&pipe_path, Mode::S_IRUSR | Mode::S_IWUSR)
                .map_err(|e| format!("Failed to create FIFO: {}", e))?;
        }

        #[cfg(not(unix))]
        {
            return Err("Terminal streaming is only supported on Unix systems".to_string());
        }

        // 3. Capture scrollback history (exclude visible pane)
        let scrollback_output = std::process::Command::new("tmux")
            .args(&[
                "capture-pane",
                "-t", session,
                "-p",        // Print to stdout
                "-S", "-",   // Start from beginning of scrollback
                "-E", "-1",  // End at last scrollback line (exclude visible pane)
            ])
            .output()
            .map_err(|e| format!("Failed to capture scrollback: {}", e))?;

        let scrollback_data = if scrollback_output.status.success() {
            String::from_utf8_lossy(&scrollback_output.stdout).to_string()
        } else {
            String::new()
        };

        // 4. Capture visible pane separately (with escape sequences)
        let visible_output = std::process::Command::new("tmux")
            .args(&[
                "capture-pane",
                "-t", session,
                "-p",   // Print to stdout
                "-e",   // Include escape sequences
            ])
            .output()
            .map_err(|e| format!("Failed to capture visible pane: {}", e))?;

        let visible_data = if visible_output.status.success() {
            String::from_utf8_lossy(&visible_output.stdout).to_string()
        } else {
            String::new()
        };

        // 5. Enable pipe-pane for live streaming
        let output = std::process::Command::new("tmux")
            .args(&[
                "pipe-pane",
                "-t",
                session,
                &format!("exec cat >> {}", pipe_path_str),
            ])
            .output()
            .map_err(|e| format!("Failed to start pipe-pane: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to enable pipe-pane: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        // 6. Check if stream already active for this session
        if self.active_streams.lock().await.contains_key(session) {
            eprintln!("Warning: Stream already active for session: {}", session);
            return Ok(());
        }

        // 7. Spawn FIFO reader task
        let session_clone = session.to_string();
        let pipe_path_clone = pipe_path.clone();
        let app_handle_clone = app_handle.clone();
        let active_streams_clone = self.active_streams.clone();
        let session_for_cleanup = session.to_string();

        let task_handle = tokio::spawn(async move {
            if let Err(e) = stream_pipe_to_frontend(
                app_handle_clone,
                session_clone.clone(),
                pipe_path_clone,
            )
            .await
            {
                eprintln!("Stream error for {}: {}", session_clone, e);
            }

            active_streams_clone.lock().await.remove(&session_for_cleanup);
        });

        // 8. Track task handle
        self.active_streams
            .lock()
            .await
            .insert(session.to_string(), task_handle);

        // 9. Emit scrollback history
        if !scrollback_data.is_empty() {
            let scrollback_event = TerminalOutput {
                session: session.to_string(),
                data: scrollback_data,
                timestamp: chrono::Utc::now().timestamp_millis(),
            };
            let _ = app_handle.emit("terminal-output", scrollback_event);
        }

        // 10. Emit visible pane content
        if !visible_data.is_empty() {
            let visible_event = TerminalOutput {
                session: session.to_string(),
                data: visible_data,
                timestamp: chrono::Utc::now().timestamp_millis(),
            };
            let _ = app_handle.emit("terminal-output", visible_event);
        }

        Ok(())
    }

    /// Stop streaming terminal output for a session
    ///
    /// Aborts the async task, disables pipe-pane, and cleans up the FIFO file.
    pub async fn stop_session_stream(&self, session: &str) -> Result<(), String> {
        // 1. Abort async task
        if let Some(handle) = self.active_streams.lock().await.remove(session) {
            handle.abort();
        }

        // 2. Disable pipe-pane
        let output = std::process::Command::new("tmux")
            .args(&["pipe-pane", "-t", session])
            .output()
            .map_err(|e| format!("Failed to stop pipe-pane: {}", e))?;

        if !output.status.success() {
            eprintln!(
                "Warning: Failed to disable pipe-pane for {}: {}",
                session,
                String::from_utf8_lossy(&output.stderr)
            );
        }

        // 3. Clean up FIFO file
        let pipe_path = PathBuf::from(format!("{}/{}.pipe", STREAM_DIR, session));
        if pipe_path.exists() {
            std::fs::remove_file(&pipe_path)
                .map_err(|e| format!("Failed to remove pipe file: {}", e))?;
        }

        Ok(())
    }

    /// Get the number of active streams
    pub async fn active_count(&self) -> usize {
        self.active_streams.lock().await.len()
    }

    /// Check if a stream is active for a session
    pub async fn is_active(&self, session: &str) -> bool {
        self.active_streams.lock().await.contains_key(session)
    }
}

/// Async task to read from FIFO and emit to frontend
///
/// ✅ FIX BUG-6: Uses byte-level streaming for real-time output (no line buffering)
/// Reads bytes from the named pipe and emits them as `terminal-output` events.
/// When EOF is reached (agent dies or tmux killed), emits a `terminal-disconnected` event.
async fn stream_pipe_to_frontend(
    app_handle: AppHandle,
    session: String,
    pipe_path: PathBuf,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    // Wait for FIFO to exist (should already be created)
    let mut attempts = 0;
    while !pipe_path.exists() && attempts < 50 {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        attempts += 1;
    }

    if !pipe_path.exists() {
        return Err("FIFO not created".to_string());
    }

    // ✅ FIX BUG-5: Add retry logic for FIFO open (race condition mitigation)
    let mut file = None;
    for attempt in 0..5 {
        match tokio::fs::File::open(&pipe_path).await {
            Ok(f) => {
                file = Some(f);
                break;
            }
            Err(e) if attempt < 4 => {
                eprintln!("FIFO open attempt {} failed: {}, retrying...", attempt + 1, e);
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
            Err(e) => {
                return Err(format!("Failed to open FIFO after 5 attempts: {}", e));
            }
        }
    }

    let mut file = file.expect("File should be Some after successful open");

    // ✅ FIX BUG-6 + BUG-7: Use byte-level streaming with smart batching
    // - Real-time mode: Emit immediately when data arrives slowly (< 16ms between reads)
    // - Batch mode: Collect rapid output for animations (e.g., Claude's star animation)
    let mut buffer = vec![0u8; 4096]; // Larger buffer for batching
    let mut accumulated_data = String::new();
    let batch_timeout = tokio::time::Duration::from_millis(16); // ~60fps batching window

    loop {
        // Try to read with timeout for batching
        let read_result = tokio::time::timeout(batch_timeout, file.read(&mut buffer)).await;

        match read_result {
            Ok(Ok(0)) => {
                // EOF - flush any accumulated data first
                if !accumulated_data.is_empty() {
                    let output = TerminalOutput {
                        session: session.clone(),
                        data: accumulated_data.clone(),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };
                    let _ = app_handle.emit("terminal-output", output);
                }

                // Stream ended
                eprintln!("Stream ended for session: {}", session);
                if let Err(e) = app_handle.emit("terminal-disconnected", session.clone()) {
                    eprintln!("Failed to emit terminal-disconnected event: {}", e);
                }
                break;
            }
            Ok(Ok(n)) => {
                // Got data - accumulate it
                accumulated_data.push_str(&String::from_utf8_lossy(&buffer[..n]));

                // Continue reading to batch rapid output (loop back immediately)
            }
            Ok(Err(e)) => {
                eprintln!("Error reading from FIFO: {}", e);
                break;
            }
            Err(_) => {
                // Timeout - emit accumulated data if any
                if !accumulated_data.is_empty() {
                    let output = TerminalOutput {
                        session: session.clone(),
                        data: accumulated_data.clone(),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };

                    if let Err(e) = app_handle.emit("terminal-output", output) {
                        eprintln!("Failed to emit terminal-output event: {}", e);
                    }

                    accumulated_data.clear();
                }
                // Continue loop to wait for more data
            }
        }
    }

    Ok(())
}

/// Cleanup orphaned streams on app startup (crash recovery)
///
/// Called during app initialization to:
/// 1. Disable pipe-pane for all agent sessions (idempotent)
/// 2. Remove all stale pipe files from previous sessions
///
/// Prevents resource leaks from previous crashes.
pub async fn cleanup_orphaned_streams() -> Result<(), String> {
    // 1. Disable pipe-pane for all agent sessions (idempotent)
    if let Ok(sessions) = crate::tmux::session::list_sessions() {
        for session in sessions {
            if session.starts_with("agent-") {
                // Disable pipe-pane (ignore errors - may not be enabled)
                let _ = std::process::Command::new("tmux")
                    .args(&["pipe-pane", "-t", &session])
                    .output();
            }
        }
    }

    // 2. Remove all pipe files from previous sessions
    let stream_dir = PathBuf::from(STREAM_DIR);
    if stream_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&stream_dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_manager_creation() {
        let manager = TerminalStreamManager::new();
        assert_eq!(manager.active_count().await, 0);
    }

    #[tokio::test]
    async fn test_stream_tracking() {
        let manager = TerminalStreamManager::new();
        assert!(!manager.is_active("test-session").await);
    }

    #[test]
    fn test_stream_dir_constant() {
        assert_eq!(STREAM_DIR, "/tmp/nolan-streams");
    }
}
