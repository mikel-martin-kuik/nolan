//! WebSocket handlers for real-time streaming
//!
//! Provides WebSocket endpoints for:
//! - Terminal output streaming
//! - Agent status streaming
//! - History entry streaming

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
};
use std::sync::Arc;
use tokio::sync::broadcast;

use super::AppState;
use crate::commands::lifecycle::get_agent_status;
use crate::tmux::terminal_stream::TerminalOutput;

/// WebSocket handler for terminal output streaming
///
/// Extractors order matters in Axum 0.7:
/// - State and other extractors first
/// - WebSocketUpgrade last (it consumes the request body)
pub async fn terminal_stream(
    State(state): State<Arc<AppState>>,
    Path(session): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_terminal_stream(socket, session, state))
}

async fn handle_terminal_stream(mut socket: WebSocket, session: String, state: Arc<AppState>) {
    // Subscribe FIRST so we don't miss any messages
    let mut rx = state.terminal_tx.subscribe();

    // Start the terminal broadcast for this session
    // Pass the socket so we can send scrollback directly
    match start_terminal_broadcast(&session, state.terminal_tx.clone(), &mut socket).await {
        Ok(_) => {},
        Err(e) => {
            eprintln!("Failed to start terminal broadcast for {}: {}", session, e);
            let _ = socket.send(Message::Text(format!(r#"{{"error": "{}"}}"#, e))).await;
            return;
        }
    }

    loop {
        tokio::select! {
            // Forward terminal output to WebSocket
            result = rx.recv() => {
                match result {
                    Ok(output) => {
                        // Filter to only send output for this session
                        if output.session == session {
                            let json = serde_json::to_string(&output).unwrap_or_default();
                            if socket.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            // Handle incoming messages
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(_)) => break,
                    None => break,
                    _ => {}
                }
            }
        }
    }
}

/// Start terminal streaming for a session and broadcast to WebSocket clients
///
/// This is called from the API layer when a client connects via WebSocket.
/// It sets up the tmux pipe-pane and forwards output to the broadcast channel.
/// The socket is passed so we can send initial scrollback directly (before broadcast loop starts).
pub async fn start_terminal_broadcast(
    session: &str,
    tx: broadcast::Sender<TerminalOutput>,
    socket: &mut WebSocket,
) -> Result<(), String> {
    use std::path::PathBuf;
    use tokio::io::AsyncReadExt;

    const STREAM_DIR: &str = "/tmp/nolan-streams";

    // Validate session exists
    if !crate::tmux::session::session_exists(session)? {
        return Err(format!("Session '{}' does not exist", session));
    }

    // Create stream directory
    let stream_dir = PathBuf::from(STREAM_DIR);
    std::fs::create_dir_all(&stream_dir)
        .map_err(|e| format!("Failed to create stream dir: {}", e))?;

    // Create named pipe (FIFO)
    let pipe_path = stream_dir.join(format!("{}.pipe", session));
    let pipe_path_str = pipe_path.to_string_lossy().to_string();

    // Remove existing pipe if present
    let _ = std::fs::remove_file(&pipe_path);

    // Create FIFO with secure permissions
    #[cfg(unix)]
    {
        use nix::sys::stat::Mode;
        use nix::unistd::mkfifo;

        mkfifo(&pipe_path, Mode::S_IRUSR | Mode::S_IWUSR)
            .map_err(|e| format!("Failed to create FIFO: {}", e))?;
    }

    // Enable pipe-pane for live streaming
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

    // Capture initial scrollback and send directly to the WebSocket
    let scrollback_output = std::process::Command::new("tmux")
        .args(&["capture-pane", "-t", session, "-p", "-S", "-", "-E", "-1"])
        .output()
        .map_err(|e| format!("Failed to capture scrollback: {}", e))?;

    if scrollback_output.status.success() {
        let scrollback_data = String::from_utf8_lossy(&scrollback_output.stdout).to_string();
        if !scrollback_data.is_empty() {
            let output = TerminalOutput {
                session: session.to_string(),
                data: scrollback_data,
                timestamp: chrono::Utc::now().timestamp_millis(),
            };
            let json = serde_json::to_string(&output).unwrap_or_default();
            // Send directly to WebSocket (not broadcast, since we're the only listener)
            let _ = socket.send(Message::Text(json)).await;
        }
    }

    // Spawn task to read from FIFO and broadcast
    let session_owned = session.to_string();
    let pipe_path_owned = pipe_path.clone();

    tokio::spawn(async move {
        // Wait for FIFO to be ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        if let Ok(mut file) = tokio::fs::File::open(&pipe_path_owned).await {
            let mut buffer = vec![0u8; 4096];
            let mut accumulated_data = String::new();
            let batch_timeout = tokio::time::Duration::from_millis(16);

            loop {
                let read_result =
                    tokio::time::timeout(batch_timeout, file.read(&mut buffer)).await;

                match read_result {
                    Ok(Ok(0)) => {
                        // EOF
                        if !accumulated_data.is_empty() {
                            let _ = tx.send(TerminalOutput {
                                session: session_owned.clone(),
                                data: accumulated_data.clone(),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            });
                        }
                        break;
                    }
                    Ok(Ok(n)) => {
                        accumulated_data.push_str(&String::from_utf8_lossy(&buffer[..n]));
                    }
                    Ok(Err(_)) => break,
                    Err(_) => {
                        // Timeout - emit accumulated data
                        if !accumulated_data.is_empty() {
                            let _ = tx.send(TerminalOutput {
                                session: session_owned.clone(),
                                data: accumulated_data.clone(),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            });
                            accumulated_data.clear();
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

/// WebSocket handler for agent status streaming
pub async fn status_stream(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_status_stream(socket, state))
}

async fn handle_status_stream(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.status_tx.subscribe();

    // Send initial status
    if let Ok(status) = get_agent_status().await {
        let json = serde_json::to_string(&status).unwrap_or_default();
        if socket.send(Message::Text(json)).await.is_err() {
            return;
        }
    }

    // Stream status updates
    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(status) => {
                        let json = serde_json::to_string(&status).unwrap_or_default();
                        if socket.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(_)) => break,
                    None => break,
                    _ => {}
                }
            }
        }
    }
}

/// WebSocket handler for history entry streaming
pub async fn history_stream(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_history_stream(socket, state))
}

async fn handle_history_stream(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.history_tx.subscribe();

    // Stream history entries in real-time
    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(entry) => {
                        let json = serde_json::to_string(&entry).unwrap_or_default();
                        if socket.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        eprintln!("History WebSocket lagged by {} messages", n);
                        // Continue - we'll catch up
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(_)) => break,
                    None => break,
                    _ => {}
                }
            }
        }
    }
}
