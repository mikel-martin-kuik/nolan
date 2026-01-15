//! Role template commands

use crate::config::{list_roles, load_role_config, RoleConfig};

/// Get a specific role template configuration
#[tauri::command]
pub fn get_role_config(role_name: String) -> Result<RoleConfig, String> {
    load_role_config(&role_name)
}

/// List all available role templates
#[tauri::command]
pub fn list_role_templates() -> Result<Vec<String>, String> {
    list_roles()
}
