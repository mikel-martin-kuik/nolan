//! Organization configuration commands

use crate::config::{load_organization_config, OrganizationConfig};

/// Get organization configuration
#[tauri::command]
pub fn get_organization_config() -> Result<OrganizationConfig, String> {
    load_organization_config()
}
