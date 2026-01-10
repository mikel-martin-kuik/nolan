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

use crate::commands::lifecycle::AgentStatusList;
use crate::tmux::terminal_stream::TerminalOutput;

/// Shared application state for HTTP handlers
#[derive(Clone)]
pub struct AppState {
    /// Broadcast channel for terminal output events
    pub terminal_tx: broadcast::Sender<TerminalOutput>,
    /// Broadcast channel for agent status changes
    pub status_tx: broadcast::Sender<AgentStatusList>,
}

impl AppState {
    pub fn new() -> Self {
        let (terminal_tx, _) = broadcast::channel(1024);
        let (status_tx, _) = broadcast::channel(64);
        Self { terminal_tx, status_tx }
    }
}

/// Global reference to status broadcast channel (for use from lifecycle commands)
static STATUS_TX: std::sync::OnceLock<broadcast::Sender<AgentStatusList>> = std::sync::OnceLock::new();

pub fn set_status_broadcaster(tx: broadcast::Sender<AgentStatusList>) {
    let _ = STATUS_TX.set(tx);
}

pub fn broadcast_status_change(status: AgentStatusList) {
    if let Some(tx) = STATUS_TX.get() {
        let _ = tx.send(status);
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

    // Initialize global status broadcaster for use from lifecycle commands
    set_status_broadcaster(state.status_tx.clone());

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

    axum::serve(listener, app)
        .await
        .expect("HTTP server error");
}
