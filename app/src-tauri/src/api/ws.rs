//! WebSocket handlers for real-time streaming
//!
//! Provides WebSocket endpoints for:
//! - Agent status streaming
//! - History entry streaming

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use std::sync::Arc;
use tokio::sync::broadcast;

use super::AppState;
use crate::commands::lifecycle::get_agent_status;

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
        if socket.send(Message::Text(json.into())).await.is_err() {
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
                        if socket.send(Message::Text(json.into())).await.is_err() {
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
                        if socket.send(Message::Text(json.into())).await.is_err() {
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
