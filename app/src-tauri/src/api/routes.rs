//! HTTP API route definitions

use axum::{
    middleware,
    routing::{get, post, put, delete},
    Router,
};
use std::sync::Arc;

use super::auth::{self, AuthState};
use super::handlers;
use super::ws;
use super::AppState;

/// Create the main API router with all routes
pub fn create_router(state: Arc<AppState>) -> Router {
    let auth_state = AuthState::new();

    // Auth routes (no authentication required)
    let auth_routes = Router::new()
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/status", get(auth::get_auth_status))
        .route("/api/auth/setup", post(auth::setup_password_handler))
        .with_state(auth_state.clone());

    // Protected routes with auth middleware
    let protected_routes = Router::new()
        // Health check
        .route("/api/health", get(handlers::health))
        // No-op endpoint for browser-incompatible commands
        .route("/api/noop", post(handlers::noop))
        // Agents (static routes before dynamic :name routes)
        .route("/api/agents", get(handlers::agents::list_agents))
        .route("/api/agents", post(handlers::agents::create_agent))
        .route("/api/agents/template", get(handlers::agents::get_template))
        .route("/api/agents/:name", get(handlers::agents::get_agent))
        .route("/api/agents/:name", put(handlers::agents::update_agent))
        .route("/api/agents/:name", delete(handlers::agents::delete_agent))
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
        // Organization (V1.1)
        .route("/api/organization", get(handlers::organization::get_organization))
        // Roles (V1.2)
        .route("/api/roles", get(handlers::roles::list_roles))
        .route("/api/roles/:name", get(handlers::roles::get_role))
        // Policies (V1.3)
        .route("/api/policies/:name", get(handlers::policies::get_policy))
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
        // Recovery
        .route("/api/recovery/orphaned", get(handlers::lifecycle::list_orphaned_sessions))
        .route("/api/recovery/recover", post(handlers::lifecycle::recover_sessions))
        // Communication
        .route("/api/communicate/message", post(handlers::communicate::send_message))
        .route("/api/communicate/command", post(handlers::communicate::send_command))
        .route("/api/communicate/broadcast-team", post(handlers::communicate::broadcast_team))
        .route("/api/communicate/broadcast-all", post(handlers::communicate::broadcast_all))
        .route("/api/communicate/targets", get(handlers::communicate::get_targets))
        // Projects (static routes before dynamic :name routes)
        .route("/api/projects", get(handlers::projects::list_projects))
        .route("/api/projects", post(handlers::projects::create_project))
        .route("/api/projects/roadmap", get(handlers::projects::read_roadmap))
        .route("/api/projects/roadmap/files", get(handlers::projects::list_roadmap_files))
        .route("/api/projects/:name/files", get(handlers::projects::list_files))
        .route("/api/projects/:name/file", get(handlers::projects::read_file))
        .route("/api/projects/:name/file", put(handlers::projects::write_file))
        .route("/api/projects/:name/team", get(handlers::projects::get_team))
        .route("/api/projects/:name/team", put(handlers::projects::set_team))
        .route("/api/projects/:name/status", put(handlers::projects::update_status))
        .route("/api/projects/:name/file-marker", put(handlers::projects::update_file_marker))
        // Terminal
        .route("/api/terminal/start", post(handlers::terminal::start_stream))
        .route("/api/terminal/stop", post(handlers::terminal::stop_stream))
        .route("/api/terminal/input", post(handlers::terminal::send_input))
        .route("/api/terminal/key", post(handlers::terminal::send_key))
        .route("/api/terminal/resize", post(handlers::terminal::resize))
        // History (REST endpoints for loading)
        .route("/api/history/entries", get(handlers::history::load_entries))
        .route("/api/history/active", get(handlers::history::load_active_sessions))
        // Usage stats
        .route("/api/usage/stats", get(handlers::usage::get_stats))
        .route("/api/usage/sessions", get(handlers::usage::get_sessions))
        .route("/api/usage/range", get(handlers::usage::get_by_date_range))
        // Cronos (cron agents)
        .route("/api/cronos/agents", get(handlers::cronos::list_agents))
        .route("/api/cronos/agents", post(handlers::cronos::create_agent))
        .route("/api/cronos/agents/:name", get(handlers::cronos::get_agent))
        .route("/api/cronos/agents/:name", put(handlers::cronos::update_agent))
        .route("/api/cronos/agents/:name", delete(handlers::cronos::delete_agent))
        .route("/api/cronos/agents/:name/toggle", post(handlers::cronos::toggle_agent))
        .route("/api/cronos/agents/:name/test", post(handlers::cronos::test_agent))
        .route("/api/cronos/agents/:name/trigger", post(handlers::cronos::trigger_agent))
        .route("/api/cronos/agents/:name/cancel", post(handlers::cronos::cancel_agent))
        .route("/api/cronos/agents/:name/stats", get(handlers::cronos::get_agent_stats))
        .route("/api/cronos/agents/:name/history", get(handlers::cronos::get_run_history))
        .route("/api/cronos/history", get(handlers::cronos::get_all_run_history))
        .route("/api/cronos/agents/:name/claude-md", get(handlers::cronos::read_claude_md))
        .route("/api/cronos/agents/:name/claude-md", put(handlers::cronos::write_claude_md))
        .route("/api/cronos/runs/:run_id/log", get(handlers::cronos::get_run_log))
        .route("/api/cronos/running", get(handlers::cronos::get_running))
        .route("/api/cronos/health", get(handlers::cronos::get_health))
        .route("/api/cronos/init", post(handlers::cronos::init))
        .route("/api/cronos/shutdown", post(handlers::cronos::shutdown))
        // WebSocket endpoints
        .route("/api/ws/terminal/:session", get(ws::terminal_stream))
        .route("/api/ws/status", get(ws::status_stream))
        .route("/api/ws/history", get(ws::history_stream))
        // Feedback (feature requests & ideas)
        .route("/api/feedback/requests", get(handlers::feedback::list_requests))
        .route("/api/feedback/requests", post(handlers::feedback::create_request))
        .route("/api/feedback/requests/:id", delete(handlers::feedback::delete_request))
        .route("/api/feedback/requests/:id/status", put(handlers::feedback::update_status))
        .route("/api/feedback/requests/:id/vote", post(handlers::feedback::vote))
        .route("/api/feedback/ideas", get(handlers::feedback::list_ideas))
        .route("/api/feedback/ideas", post(handlers::feedback::create_idea))
        .route("/api/feedback/ideas/:id", delete(handlers::feedback::delete_idea))
        .route("/api/feedback/ideas/:id/status", put(handlers::feedback::update_idea_status))
        .route("/api/feedback/stats", get(handlers::feedback::get_stats))
        .route("/api/feedback/votes", get(handlers::feedback::get_user_votes))
        // Ollama (local LLM)
        .route("/api/ollama/status", get(handlers::ollama::get_status))
        .route("/api/ollama/models", get(handlers::ollama::list_models))
        .route("/api/ollama/generate", post(handlers::ollama::generate))
        .route("/api/ollama/chat", post(handlers::ollama::chat))
        .route("/api/ollama/config", get(handlers::ollama::get_config))
        .route("/api/ollama/config", put(handlers::ollama::update_config))
        // Add state and auth middleware
        .with_state(state)
        .layer(middleware::from_fn_with_state(auth_state, auth::auth_middleware));

    auth_routes.merge(protected_routes)
}
