pub mod agents;
pub mod communicator;
pub mod deployment;
pub mod feedback;
pub mod filesystem;
pub mod history;
pub mod lifecycle;
pub mod lifecycle_core;
pub mod ollama;
pub mod organization;
pub mod policies;
pub mod projects;
pub mod roles;
pub mod session_labels;
pub mod teams;
pub mod templates;
pub mod usage;

// === Lifecycle Submodules (split from lifecycle.rs for AI-friendly file sizes) ===
// See docs/AI_ARCHITECTURE.md for guidelines
pub mod lifecycle_helpers;
pub mod lifecycle_ralph;
pub mod lifecycle_status;
pub mod lifecycle_team;
pub mod lifecycle_terminal;

// Whitelist of allowed scripts that Tauri can execute
// Note: kill-core.sh and spawn-agent.sh have been migrated to native Rust and can be deleted
// team-aliases.sh is NOT called by Tauri but is still sourced by agent CLI tooling (hooks, commands)
const ALLOWED_SCRIPTS: &[&str] = &[
    // Currently no scripts needed - all lifecycle/messaging is native
    // Add scripts here if needed for future features
];

/// Execute a script with security validation
#[tauri::command]
pub async fn execute_script(script_name: String, args: Vec<String>) -> Result<String, String> {
    // 1. Validate script name against whitelist
    if !ALLOWED_SCRIPTS.contains(&script_name.as_str()) {
        return Err(format!(
            "Script '{}' is not allowed. Allowed scripts: {:?}",
            script_name, ALLOWED_SCRIPTS
        ));
    }

    // 2. Get and validate scripts directory
    let scripts_dir = crate::utils::paths::get_scripts_dir()?;
    let script_path = scripts_dir.join(&script_name);

    // 3. CRITICAL: Ensure resolved path is still within scripts directory
    //    This prevents path traversal attacks (e.g., "../../../etc/passwd")
    let canonical_path = script_path
        .canonicalize()
        .map_err(|e| format!("Script not found: {}", e))?;

    if !canonical_path.starts_with(&scripts_dir) {
        return Err(format!(
            "Security violation: Path traversal detected in '{}'",
            script_name
        ));
    }

    // 4. Verify script file exists and is executable
    if !canonical_path.exists() {
        return Err(format!("Script '{}' does not exist", script_name));
    }

    // 5. Execute script with validated path
    let output = crate::shell::executor::execute_script(&canonical_path, &args)?;

    if output.success {
        Ok(output.stdout)
    } else {
        Err(output.user_message())
    }
}

/// List all tmux sessions
#[tauri::command]
pub async fn list_sessions() -> Result<Vec<String>, String> {
    crate::tmux::session::list_sessions()
}

/// Check if a tmux session exists
#[tauri::command]
pub async fn session_exists(session_name: String) -> Result<bool, String> {
    crate::tmux::session::session_exists(&session_name)
}

/// Get UI configuration (status labels, colors, etc.) from config.yaml
#[tauri::command]
pub fn get_ui_config() -> Result<crate::config::UIConfig, String> {
    crate::config::load_ui_config()
}

/// Provider info for frontend
#[derive(serde::Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub available: bool,
    pub description: String,
}

/// Providers status response
#[derive(serde::Serialize)]
pub struct ProvidersStatusResponse {
    pub providers: Vec<ProviderInfo>,
    pub default_provider: String,
}

/// Get CLI providers status
#[tauri::command]
pub fn get_providers_status() -> ProvidersStatusResponse {
    let providers = crate::cli_providers::supported_providers()
        .into_iter()
        .map(|name| {
            let description = match name {
                "claude" => "Claude Code CLI - Anthropic's official AI coding assistant",
                "opencode" => "OpenCode CLI - Open-source, multi-provider coding assistant",
                _ => "Unknown provider",
            };
            ProviderInfo {
                name: name.to_string(),
                available: crate::cli_providers::is_provider_available(name),
                description: description.to_string(),
            }
        })
        .collect();

    ProvidersStatusResponse {
        providers,
        default_provider: crate::config::get_default_cli_provider(),
    }
}

/// Response for setting default provider
#[derive(serde::Serialize)]
pub struct DefaultProviderResponse {
    pub default_provider: String,
}

/// Set the default CLI provider for all agents
#[tauri::command]
pub fn set_default_cli_provider(
    provider: Option<String>,
) -> Result<DefaultProviderResponse, String> {
    crate::config::update_default_cli_provider(provider)?;

    Ok(DefaultProviderResponse {
        default_provider: crate::config::get_default_cli_provider(),
    })
}

/// Get trigger configuration (which agents handle which triggers)
#[tauri::command]
pub fn get_trigger_config() -> crate::config::TriggerConfig {
    crate::config::get_trigger_config()
}

/// Update trigger configuration
#[tauri::command]
pub fn set_trigger_config(config: crate::config::TriggerConfig) -> Result<(), String> {
    crate::config::update_trigger_config(config)
}
