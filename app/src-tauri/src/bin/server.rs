//! Headless Nolan server binary
//!
//! Runs the Nolan API server without the Tauri GUI.
//! Suitable for deployment on headless servers (e.g., Raspberry Pi, Docker).
//!
//! Usage:
//!   NOLAN_API_HOST=0.0.0.0 NOLAN_API_PORT=3030 ./nolan-server
//!
//! Environment variables:
//!   - NOLAN_API_HOST: Bind address (default: 127.0.0.1)
//!   - NOLAN_API_PORT: Port number (default: 3030)
//!   - OLLAMA_URL: Ollama server URL (default: http://localhost:11434)
//!   - OLLAMA_MODEL: Ollama model name (default: qwen2.5:1.5b)

use nolan_lib::{api, commands, scheduler, events};

#[tokio::main]
async fn main() {
    println!("Starting Nolan headless server...");

    // Recover orphaned agent sessions (from crash/restart)
    match commands::lifecycle_core::recover_all_sessions().await {
        Ok(result) => {
            if !result.is_empty() {
                eprintln!("Session recovery: {}", result.summary());
                for msg in &result.recovered {
                    eprintln!("  {}", msg);
                }
                for err in &result.errors {
                    eprintln!("  Error: {}", err);
                }
            }
        }
        Err(e) => {
            eprintln!("Warning: Failed to recover orphaned sessions: {}", e);
        }
    }

    // Initialize Scheduler
    if let Err(e) = scheduler::commands::init_scheduler().await {
        eprintln!("Warning: Failed to initialize Scheduler: {}", e);
    }

    // Recover orphaned scheduled sessions
    match scheduler::commands::recover_orphaned_scheduled_sessions().await {
        Ok(result) => {
            if !result.is_empty() {
                eprintln!("Scheduler recovery: {}", result.summary());
                for msg in &result.recovered {
                    eprintln!("  {}", msg);
                }
                for msg in &result.interrupted {
                    eprintln!("  {}", msg);
                }
                for err in &result.errors {
                    eprintln!("  Error: {}", err);
                }
            }
        }
        Err(e) => {
            eprintln!("Warning: Failed to recover cron sessions: {}", e);
        }
    }

    // Start event listener for event-driven agents
    events::handlers::start_event_listener().await;

    // Parse port from environment
    let api_port: u16 = std::env::var("NOLAN_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3030);

    println!("Nolan server initialized. Starting API server...");

    // Start HTTP API server (blocks)
    api::start_server(api_port).await;
}
