//! Organization HTTP handlers

use crate::config::{load_organization_config, OrganizationConfig};
use axum::Json;

/// Get organization configuration
pub async fn get_organization() -> Result<Json<OrganizationConfig>, (axum::http::StatusCode, String)>
{
    load_organization_config()
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))
}
