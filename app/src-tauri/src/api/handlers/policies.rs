//! Policy HTTP handlers

use axum::{extract::Path, Json};
use crate::config::{load_policy_config, PolicyConfig};

/// Get policy configuration by name
pub async fn get_policy(Path(name): Path<String>) -> Result<Json<PolicyConfig>, (axum::http::StatusCode, String)> {
    load_policy_config(&name)
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::NOT_FOUND, e))
}
