//! Usage stats HTTP handlers

use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::commands::usage::{self, UsageStats, ProjectUsage};

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

/// Get usage stats query params
#[derive(Deserialize)]
pub struct UsageStatsQuery {
    days: Option<u32>,
}

/// Get usage stats
pub async fn get_stats(
    Query(query): Query<UsageStatsQuery>,
) -> Result<Json<UsageStats>, impl IntoResponse> {
    match usage::get_usage_stats(query.days) {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get session stats query params
#[derive(Deserialize)]
pub struct SessionStatsQuery {
    since: Option<String>,
    until: Option<String>,
    order: Option<String>,
}

/// Get session stats
pub async fn get_sessions(
    Query(query): Query<SessionStatsQuery>,
) -> Result<Json<Vec<ProjectUsage>>, impl IntoResponse> {
    match usage::get_session_stats(query.since, query.until, query.order) {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get usage by date range query params
#[derive(Deserialize)]
pub struct DateRangeQuery {
    #[serde(alias = "startDate")]
    start_date: String,
    #[serde(alias = "endDate")]
    end_date: String,
}

/// Get usage by date range
pub async fn get_by_date_range(
    Query(query): Query<DateRangeQuery>,
) -> Result<Json<UsageStats>, impl IntoResponse> {
    match usage::get_usage_by_date_range(query.start_date, query.end_date) {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}
