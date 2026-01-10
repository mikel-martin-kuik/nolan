// Module declarations
pub mod api;
pub mod commands;
pub mod config;
pub mod constants;
pub mod cronos;
pub mod error;
pub mod shell;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::lifecycle::*;
use commands::communicator::*;
use commands::history::*;
use commands::projects::*;
use commands::usage::*;
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
    // This finds both:
    // - Ralph directories that exist but have no running tmux session
    // - Team sessions that were in the registry but are no longer running
    // and restarts them with --continue to resume the Claude conversation
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
            create_project,
            // Teams commands
            commands::teams::get_team_config,
            commands::teams::save_team_config,
            commands::teams::rename_team_config,
            commands::teams::list_teams,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
