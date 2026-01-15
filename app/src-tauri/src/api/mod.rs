//! HTTP API server module
//!
//! Provides REST API and WebSocket endpoints for browser-based frontend access.
//! Runs alongside Tauri, allowing the frontend to work in both desktop app and browser.

pub mod auth;
pub mod handlers;
mod routes;
pub mod ws;

use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::commands::history::HistoryEntry;
use crate::commands::lifecycle::AgentStatusList;

/// Shared application state for HTTP handlers
#[derive(Clone)]
pub struct AppState {
    /// Broadcast channel for agent status changes
    pub status_tx: broadcast::Sender<AgentStatusList>,
    /// Broadcast channel for history entry events
    pub history_tx: broadcast::Sender<HistoryEntry>,
}

impl AppState {
    pub fn new() -> Self {
        let (status_tx, _) = broadcast::channel(64);
        let (history_tx, _) = broadcast::channel(256);
        Self {
            status_tx,
            history_tx,
        }
    }
}

/// Global reference to status broadcast channel (for use from lifecycle commands)
static STATUS_TX: std::sync::OnceLock<broadcast::Sender<AgentStatusList>> =
    std::sync::OnceLock::new();

/// Global reference to history broadcast channel (for use from history commands)
static HISTORY_TX: std::sync::OnceLock<broadcast::Sender<HistoryEntry>> =
    std::sync::OnceLock::new();

pub fn set_status_broadcaster(tx: broadcast::Sender<AgentStatusList>) {
    let _ = STATUS_TX.set(tx);
}

pub fn set_history_broadcaster(tx: broadcast::Sender<HistoryEntry>) {
    let _ = HISTORY_TX.set(tx);
}

pub fn broadcast_status_change(status: AgentStatusList) {
    if let Some(tx) = STATUS_TX.get() {
        let _ = tx.send(status);
    }
}

/// Broadcast a history entry to all connected WebSocket clients
pub fn broadcast_history_entry(entry: HistoryEntry) {
    if let Some(tx) = HISTORY_TX.get() {
        let _ = tx.send(entry);
    }
}

/// Start the HTTP API server
///
/// Host configurable via NOLAN_API_HOST environment variable (default: 127.0.0.1).
/// Port configurable via NOLAN_API_PORT environment variable (default: 3030).
///
/// SECURITY: Setting NOLAN_API_HOST=0.0.0.0 exposes the server to the network.
/// Only do this with authentication enabled.
pub async fn start_server(port: u16) {
    let state = Arc::new(AppState::new());

    // Initialize global broadcasters for use from commands
    set_status_broadcaster(state.status_tx.clone());
    set_history_broadcaster(state.history_tx.clone());

    // Configure CORS for cross-origin requests
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::create_router(state).layer(cors);

    // Parse host from environment (default: localhost only)
    let host = std::env::var("NOLAN_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let addr: SocketAddr = format!("{}:{}", host, port)
        .parse()
        .expect("Invalid NOLAN_API_HOST address");

    // Security warning for network exposure
    if host == "0.0.0.0" {
        eprintln!("WARNING: Server binding to 0.0.0.0 - accessible from network");
        eprintln!("WARNING: Ensure authentication is configured before network exposure");
    }

    println!("HTTP API server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind HTTP server");

    axum::serve(listener, app).await.expect("HTTP server error");
}
