//! Commands for managing agent templates

use crate::templates::{self, TemplateInfo};
use crate::utils::paths;

/// List all available agent templates
#[tauri::command]
pub async fn list_agent_templates() -> Result<Vec<TemplateInfo>, String> {
    let agents_dir = paths::get_agents_dir()?;
    Ok(templates::list_templates(&agents_dir))
}

/// Install a template as an agent
#[tauri::command]
pub async fn install_agent_template(name: String) -> Result<(), String> {
    let agents_dir = paths::get_agents_dir()?;
    std::fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents directory: {}", e))?;
    templates::install_template(&name, &agents_dir)
}

/// Uninstall an agent (removes from agents directory)
#[tauri::command]
pub async fn uninstall_agent_template(name: String) -> Result<(), String> {
    let agents_dir = paths::get_agents_dir()?;
    templates::uninstall_template(&name, &agents_dir)
}
