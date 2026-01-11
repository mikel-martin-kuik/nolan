// Module declarations
pub mod api;
pub mod commands;
pub mod config;
pub mod constants;
pub mod cronos;
pub mod error;
pub mod ollama;
pub mod shell;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::lifecycle::*;
use commands::communicator::*;
use commands::history::*;
use commands::projects::*;
use commands::usage::*;
use commands::feedback::*;
use commands::ollama::*;
use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Cleanup orphaned terminal streams from previous crashes
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    if let Err(e) = runtime.block_on(tmux::terminal_stream::cleanup_orphaned_streams()) {
        eprintln!("Warning: Failed to cleanup orphaned terminal streams: {}", e);
        // Non-fatal - continue startup
    }

    // Attempt to recover orphaned agent sessions (from crash/restart)
    // - Ralph instances: recovered if ephemeral directory exists
    // - Team sessions: recovered only if team has an active project file
    //   (teams killed via kill_team have their active project cleared, so they won't recover)
    match runtime.block_on(commands::lifecycle_core::recover_all_sessions()) {
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
            // Non-fatal - continue startup
        }
    }

    // Initialize Cronos scheduler
    if let Err(e) = runtime.block_on(cronos::commands::init_cronos()) {
        eprintln!("Warning: Failed to initialize Cronos scheduler: {}", e);
        // Non-fatal - cronos features will be unavailable
    }

    // Recover orphaned cron sessions (runs interrupted by app restart)
    match runtime.block_on(cronos::commands::recover_orphaned_cron_sessions()) {
        Ok(result) => {
            if !result.is_empty() {
                eprintln!("Cron recovery: {}", result.summary());
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
            // Non-fatal - continue startup
        }
    }

    // Start HTTP API server in background
    // Port configurable via NOLAN_API_PORT environment variable (default: 3030)
    let api_port: u16 = std::env::var("NOLAN_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3030);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create API runtime");
        rt.block_on(api::start_server(api_port));
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is launched, focus the existing window
            let windows = app.webview_windows();
            if let Some(window) = windows.values().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            // Base commands
            execute_script,
            list_sessions,
            session_exists,
            // Lifecycle commands
            launch_team,
            kill_team,
            spawn_agent,
            start_agent,
            kill_instance,
            kill_all_instances,
            get_agent_status,
            recover_sessions,
            list_orphaned_sessions,
            launch_terminal,
            open_agent_terminal,
            open_team_terminals,
            read_agent_claude_md,
            write_agent_claude_md,
            send_agent_command,
            // Terminal streaming commands
            start_terminal_stream,
            stop_terminal_stream,
            send_terminal_input,
            send_terminal_key,
            resize_terminal,
            // Communicator commands
            send_message,
            broadcast_team,
            broadcast_all,
            get_available_targets,
            // History commands
            start_history_stream,
            stop_history_stream,
            load_history_entries,
            load_history_for_active_sessions,
            // Projects commands
            list_projects,
            list_project_files,
            read_project_file,
            write_project_file,
            read_roadmap,
            list_roadmap_files,
            create_project,
            update_project_status,
            update_file_marker,
            // Teams commands
            commands::teams::get_team_config,
            commands::teams::save_team_config,
            commands::teams::rename_team_config,
            commands::teams::list_teams,
            commands::teams::list_teams_info,  // New: hierarchical team listing
            commands::teams::get_project_team,
            commands::teams::set_project_team,
            commands::teams::get_departments_config,
            commands::teams::save_departments_config,
            // Agents commands
            commands::agents::list_agent_directories,
            commands::agents::create_agent_directory,
            commands::agents::get_agent_role_file,
            commands::agents::save_agent_role_file,
            commands::agents::delete_agent_directory,
            commands::agents::get_agent_template,
            commands::agents::save_agent_metadata,
            commands::agents::get_agent_metadata,
            // Organization commands (V1.1)
            commands::organization::get_organization_config,
            // Role commands (V1.2)
            commands::roles::get_role_config,
            commands::roles::list_role_templates,
            // Policy commands (V1.3)
            commands::policies::get_policy_config,
            // Usage commands
            get_usage_stats,
            get_usage_by_date_range,
            get_session_stats,
            // Cronos commands
            cronos::commands::list_cron_agents,
            cronos::commands::get_cron_agent,
            cronos::commands::create_cron_agent,
            cronos::commands::update_cron_agent,
            cronos::commands::delete_cron_agent,
            cronos::commands::toggle_cron_agent,
            cronos::commands::test_cron_agent,
            cronos::commands::trigger_cron_agent,
            cronos::commands::get_cron_run_history,
            cronos::commands::get_cron_run_log,
            cronos::commands::read_cron_agent_claude_md,
            cronos::commands::write_cron_agent_claude_md,
            // New cronos commands
            cronos::commands::cancel_cron_agent,
            cronos::commands::get_running_agents,
            cronos::commands::get_cronos_health,
            cronos::commands::get_agent_stats,
            cronos::commands::subscribe_cron_output,
            cronos::commands::get_cron_next_runs,
            cronos::commands::describe_cron_expression,
            // Cronos group commands
            cronos::commands::list_cron_groups,
            cronos::commands::get_cron_group,
            cronos::commands::create_cron_group,
            cronos::commands::update_cron_group,
            cronos::commands::delete_cron_group,
            cronos::commands::set_agent_group,
            // Idea dispatch commands
            cronos::commands::dispatch_ideas,
            cronos::commands::dispatch_single_idea,
            // Feedback commands
            list_feature_requests,
            create_feature_request,
            update_feature_request_status,
            vote_feature_request,
            delete_feature_request,
            list_ideas,
            create_idea,
            update_idea_status,
            delete_idea,
            update_idea,
            get_feedback_stats,
            get_user_votes,
            list_idea_reviews,
            update_review_gaps,
            update_review_proposal,
            accept_review,
            accept_and_route_review,
            // Ollama commands
            ollama_status,
            ollama_models,
            ollama_generate,
            ollama_chat,
            ollama_get_config,
            ollama_set_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    //! Tests for TypeScript type generation.
    //! Run `cargo test` to generate TypeScript bindings in src/types/generated/

    use ts_rs::TS;

    #[test]
    fn export_cronos_types() {
        use crate::cronos::types::*;

        // Export all cronos types
        CronAgentConfig::export_all().expect("Failed to export CronAgentConfig");
        CronAgentGroup::export_all().expect("Failed to export CronAgentGroup");
        GroupsConfig::export_all().expect("Failed to export GroupsConfig");
        CronSchedule::export_all().expect("Failed to export CronSchedule");
        CronGuardrails::export_all().expect("Failed to export CronGuardrails");
        CronContext::export_all().expect("Failed to export CronContext");
        ConcurrencyPolicy::export_all().expect("Failed to export ConcurrencyPolicy");
        RetryPolicy::export_all().expect("Failed to export RetryPolicy");
        CatchUpPolicy::export_all().expect("Failed to export CatchUpPolicy");
        CronRunLog::export_all().expect("Failed to export CronRunLog");
        CronRunStatus::export_all().expect("Failed to export CronRunStatus");
        RunTrigger::export_all().expect("Failed to export RunTrigger");
        SchedulerState::export_all().expect("Failed to export SchedulerState");
        AgentState::export_all().expect("Failed to export AgentState");
        ScheduleEntry::export_all().expect("Failed to export ScheduleEntry");
        CronAgentInfo::export_all().expect("Failed to export CronAgentInfo");
        AgentHealth::export_all().expect("Failed to export AgentHealth");
        HealthStatus::export_all().expect("Failed to export HealthStatus");
        AgentStats::export_all().expect("Failed to export AgentStats");
        TestRunResult::export_all().expect("Failed to export TestRunResult");
        CronOutputEvent::export_all().expect("Failed to export CronOutputEvent");
        OutputEventType::export_all().expect("Failed to export OutputEventType");
        CronosHealthSummary::export_all().expect("Failed to export CronosHealthSummary");
    }

    #[test]
    fn export_feedback_types() {
        use crate::commands::feedback::*;

        // Export all feedback types
        FeatureRequestStatus::export_all().expect("Failed to export FeatureRequestStatus");
        FeatureRequest::export_all().expect("Failed to export FeatureRequest");
        VoteRecord::export_all().expect("Failed to export VoteRecord");
        IdeaStatus::export_all().expect("Failed to export IdeaStatus");
        Idea::export_all().expect("Failed to export Idea");
        FeedbackStats::export_all().expect("Failed to export FeedbackStats");
        IdeaReviewStatus::export_all().expect("Failed to export IdeaReviewStatus");
        IdeaComplexity::export_all().expect("Failed to export IdeaComplexity");
        IdeaProposal::export_all().expect("Failed to export IdeaProposal");
        IdeaGap::export_all().expect("Failed to export IdeaGap");
        IdeaReview::export_all().expect("Failed to export IdeaReview");
        AcceptAndRouteResult::export_all().expect("Failed to export AcceptAndRouteResult");
    }
}
