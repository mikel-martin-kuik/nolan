// Module declarations
pub mod commands;
pub mod services;
pub mod shell;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::lifecycle::*;
use commands::communicator::*;
use commands::history::*;
use commands::sessions::*;
use commands::*;
use tauri::Manager;
use services::python_service::PythonService;
use std::sync::Mutex;
use utils::paths::get_transcript_service_dir;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Python service
    let service_dir = get_transcript_service_dir()
        .expect("Failed to locate transcript service");
    let script_path = service_dir.join("run.py");

    let python_service = PythonService::new(&script_path)
        .expect("Failed to start Python service");

    tauri::Builder::default()
        .manage(Mutex::new(python_service))
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
            kill_instance,
            kill_all_instances,
            get_agent_status,
            launch_terminal,
            open_agent_terminal,
            open_core_team_terminals,
            // Communicator commands
            send_message,
            broadcast_team,
            broadcast_all,
            get_available_targets,
            // History commands
            start_history_stream,
            stop_history_stream,
            // Session commands
            get_sessions,
            get_session_detail,
            export_session_html,
            export_session_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
