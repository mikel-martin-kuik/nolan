//! HTTP API route definitions

use axum::{
    middleware,
    routing::{delete, get, post, put},
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
        // Agents (static routes before dynamic {name} routes)
        .route("/api/agents", get(handlers::agents::list_agents))
        .route("/api/agents", post(handlers::agents::create_agent))
        .route("/api/agents/template", get(handlers::agents::get_template))
        .route(
            "/api/agents/templates",
            get(handlers::templates::list_templates),
        )
        .route("/api/agents/{name}", get(handlers::agents::get_agent))
        .route("/api/agents/{name}", put(handlers::agents::update_agent))
        .route("/api/agents/{name}", delete(handlers::agents::delete_agent))
        .route(
            "/api/agents/{name}/role",
            get(handlers::agents::get_agent_role),
        )
        .route(
            "/api/agents/{name}/role",
            put(handlers::agents::update_agent_role),
        )
        .route(
            "/api/agents/{name}/claude-md",
            get(handlers::agents::get_claude_md),
        )
        .route(
            "/api/agents/{name}/claude-md",
            put(handlers::agents::update_claude_md),
        )
        // Teams
        .route("/api/teams", get(handlers::teams::list_teams))
        .route("/api/teams/{name}", get(handlers::teams::get_team))
        .route("/api/teams/{name}", put(handlers::teams::update_team))
        .route("/api/teams/{name}", delete(handlers::teams::delete_team))
        .route(
            "/api/teams/{old_name}/rename/{new_name}",
            post(handlers::teams::rename_team),
        )
        .route("/api/departments", get(handlers::teams::get_departments))
        .route("/api/departments", put(handlers::teams::update_departments))
        // Organization (V1.1)
        .route(
            "/api/organization",
            get(handlers::organization::get_organization),
        )
        // UI Configuration
        .route("/api/config", get(handlers::config::get_config))
        // SSH Terminal Configuration
        .route(
            "/api/config/ssh-terminal",
            get(handlers::config::get_ssh_terminal_config),
        )
        .route(
            "/api/config/ssh-terminal",
            put(handlers::config::update_ssh_terminal),
        )
        // CLI Providers Configuration
        .route(
            "/api/config/providers",
            get(handlers::config::get_providers_status),
        )
        .route(
            "/api/config/providers/default",
            put(handlers::config::set_default_cli_provider),
        )
        // Roles (V1.2)
        .route("/api/roles", get(handlers::roles::list_roles))
        .route("/api/roles/{name}", get(handlers::roles::get_role))
        // Policies (V1.3)
        .route("/api/policies/{name}", get(handlers::policies::get_policy))
        // Lifecycle
        .route(
            "/api/lifecycle/launch-team",
            post(handlers::lifecycle::launch_team),
        )
        .route(
            "/api/lifecycle/kill-team",
            post(handlers::lifecycle::kill_team),
        )
        .route(
            "/api/lifecycle/start-agent",
            post(handlers::lifecycle::start_agent),
        )
        .route(
            "/api/lifecycle/spawn-agent",
            post(handlers::lifecycle::spawn_agent),
        )
        .route(
            "/api/lifecycle/kill-instance",
            post(handlers::lifecycle::kill_instance),
        )
        .route(
            "/api/lifecycle/kill-all",
            post(handlers::lifecycle::kill_all),
        )
        .route(
            "/api/lifecycle/status/all",
            get(handlers::lifecycle::get_all_status),
        )
        .route(
            "/api/lifecycle/status/{agent}",
            get(handlers::lifecycle::get_status),
        )
        .route("/api/sessions", get(handlers::lifecycle::list_sessions))
        .route(
            "/api/sessions/labels",
            get(handlers::lifecycle::list_session_labels),
        )
        // Recovery
        .route(
            "/api/recovery/orphaned",
            get(handlers::lifecycle::list_orphaned_sessions),
        )
        .route(
            "/api/recovery/recover",
            post(handlers::lifecycle::recover_sessions),
        )
        // Communication
        .route(
            "/api/communicate/message",
            post(handlers::communicate::send_message),
        )
        .route(
            "/api/communicate/command",
            post(handlers::communicate::send_command),
        )
        .route(
            "/api/communicate/targets",
            get(handlers::communicate::get_targets),
        )
        // Projects (static routes before dynamic {name} routes)
        .route("/api/projects", get(handlers::projects::list_projects))
        .route("/api/projects", post(handlers::projects::create_project))
        .route(
            "/api/projects/by-path",
            get(handlers::projects::get_project_info_by_path),
        )
        .route(
            "/api/projects/roadmap",
            get(handlers::projects::read_roadmap),
        )
        .route(
            "/api/projects/roadmap/files",
            get(handlers::projects::list_roadmap_files),
        )
        .route(
            "/api/projects/{name}/files",
            get(handlers::projects::list_files),
        )
        .route(
            "/api/projects/{name}/file",
            get(handlers::projects::read_file),
        )
        .route(
            "/api/projects/{name}/file",
            put(handlers::projects::write_file),
        )
        .route(
            "/api/projects/{name}/team",
            get(handlers::projects::get_team),
        )
        .route(
            "/api/projects/{name}/team",
            put(handlers::projects::set_team),
        )
        .route(
            "/api/projects/{name}/status",
            put(handlers::projects::update_status),
        )
        .route(
            "/api/projects/{name}/file-marker",
            put(handlers::projects::update_file_marker),
        )
        // History (REST endpoints for loading)
        .route("/api/history/entries", get(handlers::history::load_entries))
        .route(
            "/api/history/active",
            get(handlers::history::load_active_sessions),
        )
        // Usage stats
        .route("/api/usage/stats", get(handlers::usage::get_stats))
        .route("/api/usage/sessions", get(handlers::usage::get_sessions))
        .route("/api/usage/range", get(handlers::usage::get_by_date_range))
        .route("/api/usage/agent", get(handlers::usage::get_agent_stats))
        // Scheduler (scheduled agents)
        .route("/api/scheduler/agents", get(handlers::scheduler::list_agents))
        .route("/api/scheduler/agents", post(handlers::scheduler::create_agent))
        .route(
            "/api/scheduler/agents/{name}",
            get(handlers::scheduler::get_agent),
        )
        .route(
            "/api/scheduler/agents/{name}",
            put(handlers::scheduler::update_agent),
        )
        .route(
            "/api/scheduler/agents/{name}",
            delete(handlers::scheduler::delete_agent),
        )
        .route(
            "/api/scheduler/agents/{name}/toggle",
            post(handlers::scheduler::toggle_agent),
        )
        .route(
            "/api/scheduler/agents/{name}/test",
            post(handlers::scheduler::test_agent),
        )
        .route(
            "/api/scheduler/agents/{name}/trigger",
            post(handlers::scheduler::trigger_agent),
        )
        .route(
            "/api/scheduler/agents/{name}/cancel",
            post(handlers::scheduler::cancel_agent),
        )
        .route(
            "/api/scheduler/agents/{name}/stats",
            get(handlers::scheduler::get_agent_stats),
        )
        .route(
            "/api/scheduler/agents/{name}/history",
            get(handlers::scheduler::get_run_history),
        )
        .route(
            "/api/scheduler/history",
            get(handlers::scheduler::get_all_run_history),
        )
        .route(
            "/api/scheduler/agents/{name}/claude-md",
            get(handlers::scheduler::read_claude_md),
        )
        .route(
            "/api/scheduler/agents/{name}/claude-md",
            put(handlers::scheduler::write_claude_md),
        )
        .route(
            "/api/scheduler/runs/{run_id}/log",
            get(handlers::scheduler::get_run_log),
        )
        .route(
            "/api/scheduler/runs/{run_id}/relaunch",
            post(handlers::scheduler::relaunch_session),
        )
        .route(
            "/api/scheduler/runs/{run_id}/skip",
            post(handlers::scheduler::skip_stage),
        )
        .route(
            "/api/scheduler/pipelines/{pipeline_id}/abort",
            post(handlers::scheduler::abort_pipeline),
        )
        .route(
            "/api/scheduler/pipelines/{pipeline_id}/complete",
            post(handlers::scheduler::complete_pipeline),
        )
        .route("/api/scheduler/running", get(handlers::scheduler::get_running))
        .route("/api/scheduler/health", get(handlers::scheduler::get_health))
        .route("/api/scheduler/init", post(handlers::scheduler::init))
        .route("/api/scheduler/shutdown", post(handlers::scheduler::shutdown))
        // Scheduler groups
        .route("/api/scheduler/groups", get(handlers::scheduler::list_groups))
        .route("/api/scheduler/groups", post(handlers::scheduler::create_group))
        .route(
            "/api/scheduler/groups/{group_id}",
            get(handlers::scheduler::get_group),
        )
        .route(
            "/api/scheduler/groups/{group_id}",
            put(handlers::scheduler::update_group),
        )
        .route(
            "/api/scheduler/groups/{group_id}",
            delete(handlers::scheduler::delete_group),
        )
        .route(
            "/api/scheduler/agents/{name}/group",
            put(handlers::scheduler::set_agent_group),
        )
        // Worktrees
        .route(
            "/api/scheduler/worktrees",
            get(handlers::scheduler::list_worktrees),
        )
        .route(
            "/api/scheduler/worktrees/cleanup",
            post(handlers::scheduler::cleanup_orphaned_worktrees),
        )
        .route(
            "/api/scheduler/worktrees/remove",
            post(handlers::scheduler::remove_worktree),
        )
        // Pipelines (order matters: specific routes before dynamic {id} routes)
        .route(
            "/api/scheduler/pipelines",
            get(handlers::scheduler::list_pipelines),
        )
        .route(
            "/api/scheduler/pipelines/definitions",
            get(handlers::scheduler::list_pipeline_definitions),
        )
        .route(
            "/api/scheduler/pipelines/definitions/default",
            get(handlers::scheduler::get_default_pipeline_definition),
        )
        .route(
            "/api/scheduler/pipelines/definitions/{name}",
            get(handlers::scheduler::get_pipeline_definition),
        )
        .route(
            "/api/scheduler/pipelines/{id}",
            get(handlers::scheduler::get_pipeline),
        )
        // WebSocket endpoints
        .route("/api/ws/status", get(ws::status_stream))
        .route("/api/ws/history", get(ws::history_stream))
        // Feedback (feature requests & ideas)
        .route(
            "/api/feedback/requests",
            get(handlers::feedback::list_requests),
        )
        .route(
            "/api/feedback/requests",
            post(handlers::feedback::create_request),
        )
        .route(
            "/api/feedback/requests/{id}",
            delete(handlers::feedback::delete_request),
        )
        .route(
            "/api/feedback/requests/{id}/status",
            put(handlers::feedback::update_status),
        )
        .route(
            "/api/feedback/requests/{id}/vote",
            post(handlers::feedback::vote),
        )
        .route("/api/feedback/ideas", get(handlers::feedback::list_ideas))
        .route("/api/feedback/ideas", post(handlers::feedback::create_idea))
        .route(
            "/api/feedback/ideas/dispatch",
            post(handlers::scheduler::dispatch_ideas),
        )
        .route(
            "/api/feedback/ideas/{id}",
            put(handlers::feedback::update_idea),
        )
        .route(
            "/api/feedback/ideas/{id}",
            delete(handlers::feedback::delete_idea),
        )
        .route(
            "/api/feedback/ideas/{id}/status",
            put(handlers::feedback::update_idea_status),
        )
        // Hotfixes (simple fixes that bypass full idea pipeline)
        .route(
            "/api/feedback/hotfixes",
            get(handlers::feedback::list_hotfixes),
        )
        .route(
            "/api/feedback/hotfixes",
            post(handlers::feedback::create_hotfix),
        )
        .route(
            "/api/feedback/hotfixes/{id}",
            put(handlers::feedback::update_hotfix),
        )
        .route(
            "/api/feedback/hotfixes/{id}",
            delete(handlers::feedback::delete_hotfix),
        )
        .route(
            "/api/feedback/hotfixes/{id}/status",
            put(handlers::feedback::update_hotfix_status),
        )
        .route(
            "/api/feedback/reviews",
            get(handlers::feedback::list_idea_reviews),
        )
        .route(
            "/api/feedback/reviews/{item_id}/accept",
            post(handlers::feedback::accept_review),
        )
        .route(
            "/api/feedback/reviews/{item_id}/proposal",
            put(handlers::feedback::update_review_proposal),
        )
        .route(
            "/api/feedback/reviews/{item_id}/gaps",
            put(handlers::feedback::update_review_gaps),
        )
        .route("/api/feedback/stats", get(handlers::feedback::get_stats))
        .route(
            "/api/feedback/votes",
            get(handlers::feedback::get_user_votes),
        )
        // Ollama (local LLM)
        .route("/api/ollama/status", get(handlers::ollama::get_status))
        .route("/api/ollama/models", get(handlers::ollama::list_models))
        .route("/api/ollama/generate", post(handlers::ollama::generate))
        .route("/api/ollama/chat", post(handlers::ollama::chat))
        .route("/api/ollama/config", get(handlers::ollama::get_config))
        .route("/api/ollama/config", put(handlers::ollama::update_config))
        // Filesystem browser
        .route(
            "/api/filesystem/browse",
            get(handlers::filesystem::browse_directory),
        )
        .route("/api/filesystem/read", get(handlers::filesystem::read_file))
        .route(
            "/api/filesystem/write",
            put(handlers::filesystem::write_file),
        )
        .route(
            "/api/filesystem/search",
            get(handlers::filesystem::search_files),
        )
        .route(
            "/api/filesystem/metadata",
            get(handlers::filesystem::get_metadata),
        )
        .route(
            "/api/filesystem/default-path",
            get(handlers::filesystem::get_default_path),
        )
        .route(
            "/api/filesystem/create-file",
            post(handlers::filesystem::create_file),
        )
        .route(
            "/api/filesystem/create-directory",
            post(handlers::filesystem::create_directory),
        )
        .route(
            "/api/filesystem/delete-file",
            delete(handlers::filesystem::delete_file),
        )
        .route(
            "/api/filesystem/delete-directory",
            delete(handlers::filesystem::delete_directory),
        )
        .route(
            "/api/filesystem/rename",
            post(handlers::filesystem::rename_file),
        )
        // Add state and auth middleware
        .with_state(state)
        .layer(middleware::from_fn_with_state(
            auth_state,
            auth::auth_middleware,
        ));

    auth_routes.merge(protected_routes)
}
