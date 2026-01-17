// Module declarations
pub mod api;
pub mod cli_providers;
pub mod commands;
pub mod config;
pub mod constants;
pub mod scheduler;
pub mod error;
pub mod events;
pub mod git;
pub mod ollama;
pub mod shell;
pub mod templates;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::communicator::*;
use commands::feedback::*;
use commands::filesystem::*;
use commands::history::*;
use commands::lifecycle::*;
use commands::ollama::*;
use commands::projects::*;
use commands::session_labels::*;
use commands::usage::*;
use commands::*;
use tauri::Manager;

/// Run the Tauri desktop application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

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

    // Initialize scheduler
    if let Err(e) = runtime.block_on(scheduler::commands::init_scheduler()) {
        eprintln!("Warning: Failed to initialize scheduler: {}", e);
        // Non-fatal - scheduler features will be unavailable
    }

    // Recover orphaned scheduled sessions (runs interrupted by app restart)
    match runtime.block_on(scheduler::commands::recover_orphaned_scheduled_sessions()) {
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
            eprintln!("Warning: Failed to recover scheduled sessions: {}", e);
            // Non-fatal - continue startup
        }
    }

    // Start event listener for event-driven agents
    runtime.block_on(events::handlers::start_event_listener());

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
            list_worktrees,
            create_worktree_for_ralph,
            remove_worktree,
            launch_terminal,
            open_agent_terminal,
            open_team_terminals,
            read_agent_claude_md,
            write_agent_claude_md,
            send_agent_command,
            // Communicator commands
            send_message,
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
            sync_project_idea_status,
            get_project_info_by_path,
            // Teams commands
            commands::teams::get_team_config,
            commands::teams::save_team_config,
            commands::teams::rename_team_config,
            commands::teams::list_teams,
            commands::teams::list_teams_info, // New: hierarchical team listing
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
            // Template commands
            commands::templates::list_agent_templates,
            commands::templates::install_agent_template,
            commands::templates::uninstall_agent_template,
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
            get_agent_usage_stats,
            get_execution_metrics,
            // Scheduler commands - agent CRUD
            scheduler::commands_agent::list_scheduled_agents,
            scheduler::commands_agent::get_scheduled_agent,
            scheduler::commands_agent::create_scheduled_agent,
            scheduler::commands_agent::update_scheduled_agent,
            scheduler::commands_agent::delete_scheduled_agent,
            scheduler::commands_agent::toggle_scheduled_agent,
            scheduler::commands_agent::test_scheduled_agent,
            scheduler::commands_agent::trigger_scheduled_agent,
            scheduler::commands_agent::read_scheduled_agent_claude_md,
            scheduler::commands_agent::write_scheduled_agent_claude_md,
            scheduler::commands_agent::cancel_scheduled_agent,
            scheduler::commands_agent::get_running_agents,
            scheduler::commands_agent::trigger_predefined_agent,
            scheduler::commands_agent::list_agent_commands,
            // Scheduler commands - groups
            scheduler::commands_agent::list_scheduled_groups,
            scheduler::commands_agent::get_scheduled_group,
            scheduler::commands_agent::create_scheduled_group,
            scheduler::commands_agent::update_scheduled_group,
            scheduler::commands_agent::delete_scheduled_group,
            scheduler::commands_agent::set_agent_group,
            // Scheduler commands - history
            scheduler::commands_history::get_scheduled_run_history,
            scheduler::commands_history::get_scheduled_run_log,
            scheduler::commands_history::get_scheduler_health,
            scheduler::commands_history::get_agent_stats,
            scheduler::commands_history::subscribe_scheduled_output,
            scheduler::commands_history::relaunch_scheduled_session,
            // Scheduler commands - schedules
            scheduler::commands_schedules::get_schedule_next_runs,
            scheduler::commands_schedules::describe_schedule_expression,
            scheduler::commands_schedules::list_schedules,
            scheduler::commands_schedules::create_schedule,
            scheduler::commands_schedules::update_schedule,
            scheduler::commands_schedules::delete_schedule,
            scheduler::commands_schedules::toggle_schedule,
            // Scheduler commands - ideas
            scheduler::commands_ideas::dispatch_ideas,
            scheduler::commands_ideas::dispatch_single_idea,
            // Scheduler commands - analyzer
            scheduler::commands_analyzer::trigger_analyzer_for_run,
            // Scheduler commands - pipeline
            scheduler::commands_pipeline::trigger_merge_for_run,
            scheduler::commands_pipeline::trigger_merge_for_worktree,
            scheduler::commands_pipeline::list_pipelines,
            scheduler::commands_pipeline::get_pipeline,
            scheduler::commands_pipeline::retry_pipeline_stage,
            scheduler::commands_pipeline::skip_pipeline_stage_cmd,
            scheduler::commands_pipeline::abort_pipeline_cmd,
            scheduler::commands_pipeline::complete_pipeline,
            scheduler::commands_pipeline::complete_pipeline_cmd,
            scheduler::commands_pipeline::list_pipeline_definitions,
            scheduler::commands_pipeline::get_pipeline_definition,
            scheduler::commands_pipeline::get_default_pipeline_definition,
            scheduler::commands_pipeline::save_pipeline_definition,
            scheduler::commands_pipeline::delete_pipeline_definition,
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
            add_idea_tag,
            remove_idea_tag,
            list_all_idea_tags,
            get_feedback_stats,
            get_user_votes,
            list_idea_reviews,
            delete_idea_review,
            update_review_gaps,
            update_review_proposal,
            accept_review,
            unaccept_review,
            accept_and_route_review,
            // Hotfix commands
            list_hotfixes,
            create_hotfix,
            update_hotfix,
            update_hotfix_status,
            delete_hotfix,
            // Ollama commands
            ollama_status,
            ollama_models,
            ollama_generate,
            ollama_chat,
            ollama_get_config,
            ollama_set_config,
            // Session label commands
            set_session_label,
            get_session_label,
            list_session_labels,
            clear_session_label,
            // Filesystem commands
            browse_directory,
            read_file_content,
            write_file_content,
            search_files,
            get_file_metadata,
            get_file_browser_default_path,
            create_file,
            create_directory,
            delete_file,
            delete_directory,
            rename_file,
            // UI Configuration
            get_ui_config,
            // CLI Providers
            get_providers_status,
            set_default_cli_provider,
            // Trigger Configuration
            get_trigger_config,
            set_trigger_config,
            // Git Folders commands
            commands::git_folders::list_git_folders,
            commands::git_folders::list_git_folders_with_worktrees,
            commands::git_folders::get_git_folder,
            commands::git_folders::clone_git_repository,
            commands::git_folders::fetch_git_folder,
            commands::git_folders::remove_git_folder,
            commands::git_folders::update_git_folder,
            commands::git_folders::scan_for_git_repositories,
            commands::git_folders::import_git_repository,
            commands::git_folders::create_git_folder_worktree,
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
    fn export_scheduler_types() {
        use crate::scheduler::commands::AgentCommand;
        use crate::scheduler::types::*;

        // Export all scheduler types
        ScheduledAgentConfig::export_all().expect("Failed to export ScheduledAgentConfig");
        ScheduledAgentGroup::export_all().expect("Failed to export ScheduledAgentGroup");
        GroupsConfig::export_all().expect("Failed to export GroupsConfig");
        ScheduleConfig::export_all().expect("Failed to export ScheduleConfig");
        AgentSchedule::export_all().expect("Failed to export AgentSchedule");
        ScheduleGuardrails::export_all().expect("Failed to export ScheduleGuardrails");
        ScheduleContext::export_all().expect("Failed to export ScheduleContext");
        ConcurrencyPolicy::export_all().expect("Failed to export ConcurrencyPolicy");
        RetryPolicy::export_all().expect("Failed to export RetryPolicy");
        CatchUpPolicy::export_all().expect("Failed to export CatchUpPolicy");
        ScheduledRunLog::export_all().expect("Failed to export ScheduledRunLog");
        ScheduledRunStatus::export_all().expect("Failed to export ScheduledRunStatus");
        RunTrigger::export_all().expect("Failed to export RunTrigger");
        SchedulerState::export_all().expect("Failed to export SchedulerState");
        AgentState::export_all().expect("Failed to export AgentState");
        ScheduleEntry::export_all().expect("Failed to export ScheduleEntry");
        TriggerConfig::export_all().expect("Failed to export TriggerConfig");
        ScheduledAgentInfo::export_all().expect("Failed to export ScheduledAgentInfo");
        AgentHealth::export_all().expect("Failed to export AgentHealth");
        HealthStatus::export_all().expect("Failed to export HealthStatus");
        AgentStats::export_all().expect("Failed to export AgentStats");
        TestRunResult::export_all().expect("Failed to export TestRunResult");
        ScheduledOutputEvent::export_all().expect("Failed to export ScheduledOutputEvent");
        OutputEventType::export_all().expect("Failed to export OutputEventType");
        SchedulerHealthSummary::export_all().expect("Failed to export SchedulerHealthSummary");

        // Export agent trigger types
        EventType::export_all().expect("Failed to export EventType");
        EventTrigger::export_all().expect("Failed to export EventTrigger");
        InvocationConfig::export_all().expect("Failed to export InvocationConfig");
        AgentCommand::export_all().expect("Failed to export AgentCommand");
        WorktreeConfig::export_all().expect("Failed to export WorktreeConfig");
    }

    #[test]
    fn export_git_types() {
        use crate::git::worktree::*;
        use crate::git::folders::*;

        // Export git worktree types
        WorktreeInfo::export_all().expect("Failed to export WorktreeInfo");
        WorktreeStatus::export_all().expect("Failed to export WorktreeStatus");
        WorktreeListEntry::export_all().expect("Failed to export WorktreeListEntry");

        // Export git folders types
        GitFolder::export_all().expect("Failed to export GitFolder");
        GitFolderStatus::export_all().expect("Failed to export GitFolderStatus");
        CloneResult::export_all().expect("Failed to export CloneResult");
        GitFolderWithWorktrees::export_all().expect("Failed to export GitFolderWithWorktrees");
        GitFolderWorktree::export_all().expect("Failed to export GitFolderWorktree");
        ScanResult::export_all().expect("Failed to export ScanResult");
    }

    #[test]
    fn export_events_types() {
        use crate::events::types::*;

        // Export event bus types
        SystemEvent::export_all().expect("Failed to export SystemEvent");
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
        DecisionStatus::export_all().expect("Failed to export DecisionStatus");
        TeamDecision::export_all().expect("Failed to export TeamDecision");
    }
}
