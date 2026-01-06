// Module declarations
pub mod commands;
pub mod constants;
pub mod error;
pub mod services;
pub mod shell;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::lifecycle::*;
use commands::communicator::*;
use commands::history::*;
use commands::sessions::*;
use commands::projects::*;
use commands::usage::*;
use commands::*;
use tauri::Manager;
use services::python_service::PythonService;
use std::sync::Arc;
use tokio::sync::Mutex;
use utils::paths::get_transcript_service_dir;

/// Initialize Python service with proper error handling
fn initialize_python_service() -> Result<PythonService, String> {
    let service_dir = get_transcript_service_dir()
        .map_err(|e| format!("Cannot locate transcript service directory: {}", e))?;

    let script_path = service_dir.join("run.py");
    if !script_path.exists() {
        return Err(format!(
            "Transcript service script not found at: {}\nPlease run setup.sh to install dependencies.",
            script_path.display()
        ));
    }

    PythonService::new(&script_path)
        .map_err(|e| format!("Failed to start Python RPC service: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Python service with graceful error handling
    let python_service = match initialize_python_service() {
        Ok(service) => service,
        Err(e) => {
            eprintln!("\n=== FATAL ERROR ===");
            eprintln!("Failed to initialize Nolan Agent System:");
            eprintln!("{}", e);
            eprintln!("\nTroubleshooting steps:");
            eprintln!("1. Ensure Python 3.8+ is installed and in PATH");
            eprintln!("2. Run './setup.sh' from the project root");
            eprintln!("3. Check that the transcript service is properly installed");
            eprintln!("===================\n");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(python_service)))
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
            launch_core,
            kill_core,
            spawn_agent,
            restart_core_agent,
            kill_instance,
            kill_all_instances,
            get_agent_status,
            launch_terminal,
            open_agent_terminal,
            open_core_team_terminals,
            read_agent_claude_md,
            write_agent_claude_md,
            send_agent_command,
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
            get_cached_history_entries,
            // Session commands
            get_sessions,
            get_sessions_paginated,
            get_session_detail,
            export_session_html,
            export_session_markdown,
            // Projects commands
            list_projects,
            list_project_files,
            read_project_file,
            read_roadmap,
            create_project,
            // Usage commands
            get_usage_stats,
            get_usage_by_date_range,
            get_session_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
