// Module declarations
pub mod commands;
pub mod shell;
pub mod tmux;
pub mod utils;

// Re-export commands for easier access
use commands::lifecycle::*;
use commands::communicator::*;
use commands::history::*;
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
