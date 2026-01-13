//! UI Configuration HTTP handlers

use axum::Json;
use crate::config::{load_ui_config, UIConfig};

/// Get UI configuration
pub async fn get_config() -> Result<Json<UIConfig>, (axum::http::StatusCode, String)> {
    load_ui_config()
        .map(Json)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))
}
