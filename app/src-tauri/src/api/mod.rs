//! HTTP API server module
//!
//! Provides REST API and WebSocket endpoints for browser-based frontend access.
//! Runs alongside Tauri, allowing the frontend to work in both desktop app and browser.

pub mod handlers;
mod routes;
pub mod ws;

use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::tmux::terminal_stream::TerminalOutput;

/// Shared application state for HTTP handlers
#[derive(Clone)]
pub struct AppState {
    /// Broadcast channel for terminal output events
    pub terminal_tx: broadcast::Sender<TerminalOutput>,
}

impl AppState {
    pub fn new() -> Self {
        let (terminal_tx, _) = broadcast::channel(1024);
        Self { terminal_tx }
    }
}

/// Start the HTTP API server
///
/// Binds to 127.0.0.1 only (localhost) for security.
/// Port is configurable via NOLAN_API_PORT environment variable (default: 3030).
pub async fn start_server(port: u16) {
    let state = Arc::new(AppState::new());

    // Configure CORS for local development
    let cors = CorsLayer::new()
        .allow_origin(Any) // Allow localhost origins
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::create_router(state).layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("HTTP API server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind HTTP server");

    axum::serve(listener, app)
        .await
        .expect("HTTP server error");
}
