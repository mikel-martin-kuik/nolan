//! Policy configuration commands

use crate::config::{load_policy_config, PolicyConfig};

/// Get policy configuration by name
#[tauri::command]
pub fn get_policy_config(policy_name: String) -> Result<PolicyConfig, String> {
    load_policy_config(&policy_name)
}
