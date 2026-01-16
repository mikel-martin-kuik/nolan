//! commands/lifecycle.rs
//!
//! Entry point for agent lifecycle Tauri commands.
//! This module provides shared utilities and re-exports commands from submodules.
//!
//! Submodules:
//! - lifecycle_helpers: Validation, config, phase detection, instance management
//! - lifecycle_ralph: Ralph spawn/kill operations (free agent)
//! - lifecycle_team: Team launch/kill/start operations
//! - lifecycle_status: Agent status monitoring and statusline parsing
//! - lifecycle_terminal: Terminal launching, CLAUDE.md, agent commands, recovery
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use tauri::{AppHandle, Emitter};

// === SHARED UTILITIES ===

/// Helper function to emit agent status change event
pub async fn emit_status_change(app_handle: &AppHandle) {
    // Small delay to allow tmux sessions to stabilize
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    if let Ok(status) = super::lifecycle_status::get_agent_status().await {
        // Emit to Tauri (desktop app)
        let _ = app_handle.emit("agent-status-changed", status.clone());
        // Broadcast to HTTP WebSocket clients (browser mode)
        crate::api::broadcast_status_change(status);
    }
}

// === RE-EXPORTS FROM SUBMODULES ===

// Helpers (validation, config, phase detection)
pub use super::lifecycle_helpers::{
    count_running_instances,
    detect_current_phase,
    determine_needed_agents,
    find_available_ralph_name,
    generate_random_name,
    get_agent_cli_provider,
    get_default_model,
    get_default_model_for_team,
    get_team_active_project_file,
    get_team_state_dir,
    is_phase_complete,
    register_session,
    validate_agent_name_format,
    validate_agent_session,
    MAX_INSTANCES,
};

// Ralph operations (spawn, kill)
pub use super::lifecycle_ralph::{
    kill_all_instances,
    kill_instance,
    spawn_agent,
    RALPH_SPAWN_LOCK,
};

// Team operations (launch, kill, start, phase)
pub use super::lifecycle_team::{
    get_docs_path_from_team_context,
    kill_team,
    launch_team,
    on_phase_complete,
    start_agent,
};

// Status monitoring
pub use super::lifecycle_status::{
    get_agent_status,
    list_available_teams,
    parse_statusline,
    AgentStatus,
    AgentStatusList,
    StatusLineData,
    RE_STATUSLINE_NEW,
    RE_STATUSLINE_OLD,
};

// Terminal, CLAUDE.md, commands, recovery
pub use super::lifecycle_terminal::{
    create_worktree_for_ralph,
    launch_terminal,
    list_orphaned_sessions,
    list_worktrees,
    open_agent_terminal,
    open_team_terminals,
    read_agent_claude_md,
    recover_sessions,
    remove_worktree,
    send_agent_command,
    write_agent_claude_md,
    RecoverSessionsResponse,
};
