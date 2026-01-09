//! HTTP API route definitions

use axum::{
    routing::{get, post, put, delete},
    Router,
};
use std::sync::Arc;

use super::handlers;
use super::ws;
use super::AppState;

/// Create the main API router with all routes
pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Health check
        .route("/api/health", get(handlers::health))
        // No-op endpoint for browser-incompatible commands
        .route("/api/noop", post(handlers::noop))
        // Agents
        .route("/api/agents", get(handlers::agents::list_agents))
        .route("/api/agents/:name", get(handlers::agents::get_agent))
        .route("/api/agents/:name", put(handlers::agents::update_agent))
        .route("/api/agents/:name", delete(handlers::agents::delete_agent))
        .route("/api/agents", post(handlers::agents::create_agent))
        .route("/api/agents/:name/role", get(handlers::agents::get_agent_role))
        .route("/api/agents/:name/role", put(handlers::agents::update_agent_role))
        .route("/api/agents/:name/claude-md", get(handlers::agents::get_claude_md))
        .route("/api/agents/:name/claude-md", put(handlers::agents::update_claude_md))
        // Teams
        .route("/api/teams", get(handlers::teams::list_teams))
        .route("/api/teams/:name", get(handlers::teams::get_team))
        .route("/api/teams/:name", put(handlers::teams::update_team))
        .route("/api/teams/:name", delete(handlers::teams::delete_team))
        .route("/api/teams/:old_name/rename/:new_name", post(handlers::teams::rename_team))
        .route("/api/departments", get(handlers::teams::get_departments))
        .route("/api/departments", put(handlers::teams::update_departments))
        // Lifecycle
        .route("/api/lifecycle/launch-team", post(handlers::lifecycle::launch_team))
        .route("/api/lifecycle/kill-team", post(handlers::lifecycle::kill_team))
        .route("/api/lifecycle/start-agent", post(handlers::lifecycle::start_agent))
        .route("/api/lifecycle/spawn-agent", post(handlers::lifecycle::spawn_agent))
        .route("/api/lifecycle/kill-instance", post(handlers::lifecycle::kill_instance))
        .route("/api/lifecycle/kill-all", post(handlers::lifecycle::kill_all))
        .route("/api/lifecycle/status/all", get(handlers::lifecycle::get_all_status))
        .route("/api/lifecycle/status/:agent", get(handlers::lifecycle::get_status))
        .route("/api/sessions", get(handlers::lifecycle::list_sessions))
        // Communication
        .route("/api/communicate/message", post(handlers::communicate::send_message))
        .route("/api/communicate/command", post(handlers::communicate::send_command))
        .route("/api/communicate/broadcast-team", post(handlers::communicate::broadcast_team))
        .route("/api/communicate/broadcast-all", post(handlers::communicate::broadcast_all))
        // Projects
        .route("/api/projects", get(handlers::projects::list_projects))
        .route("/api/projects", post(handlers::projects::create_project))
        .route("/api/projects/:name/files", get(handlers::projects::list_files))
        .route("/api/projects/:name/file", get(handlers::projects::read_file))
        .route("/api/projects/:name/file", put(handlers::projects::write_file))
        .route("/api/projects/:name/team", get(handlers::projects::get_team))
        .route("/api/projects/:name/team", put(handlers::projects::set_team))
        // Terminal
        .route("/api/terminal/start", post(handlers::terminal::start_stream))
        .route("/api/terminal/stop", post(handlers::terminal::stop_stream))
        .route("/api/terminal/input", post(handlers::terminal::send_input))
        .route("/api/terminal/key", post(handlers::terminal::send_key))
        .route("/api/terminal/resize", post(handlers::terminal::resize))
        // History (REST endpoints for loading)
        .route("/api/history/entries", get(handlers::history::load_entries))
        .route("/api/history/active", get(handlers::history::load_active_sessions))
        // Cronos (cron agents)
        .route("/api/cronos/agents", get(handlers::cronos::list_agents))
        .route("/api/cronos/agents", post(handlers::cronos::create_agent))
        .route("/api/cronos/agents/:name", get(handlers::cronos::get_agent))
        .route("/api/cronos/agents/:name", put(handlers::cronos::update_agent))
        .route("/api/cronos/agents/:name", delete(handlers::cronos::delete_agent))
        .route("/api/cronos/agents/:name/toggle", post(handlers::cronos::toggle_agent))
        .route("/api/cronos/agents/:name/test", post(handlers::cronos::test_agent))
        .route("/api/cronos/agents/:name/trigger", post(handlers::cronos::trigger_agent))
        .route("/api/cronos/agents/:name/history", get(handlers::cronos::get_run_history))
        .route("/api/cronos/agents/:name/claude-md", get(handlers::cronos::read_claude_md))
        .route("/api/cronos/agents/:name/claude-md", put(handlers::cronos::write_claude_md))
        .route("/api/cronos/runs/:run_id/log", get(handlers::cronos::get_run_log))
        .route("/api/cronos/init", post(handlers::cronos::init))
        .route("/api/cronos/shutdown", post(handlers::cronos::shutdown))
        // WebSocket endpoints
        .route("/api/ws/terminal/:session", get(ws::terminal_stream))
        // Add state
        .with_state(state)
}
