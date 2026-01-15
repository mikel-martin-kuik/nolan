//! Role template HTTP handlers

use crate::config::{list_roles as list_role_templates, load_role_config, RoleConfig};
use axum::{extract::Path, Json};

/// List all available role templates
pub async fn list_roles() -> Result<Json<Vec<String>>, (axum::http::StatusCode, String)> {
    list_role_templates()
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))
}

/// Get a specific role template configuration
pub async fn get_role(
    Path(name): Path<String>,
) -> Result<Json<RoleConfig>, (axum::http::StatusCode, String)> {
    load_role_config(&name)
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::NOT_FOUND, e))
}
