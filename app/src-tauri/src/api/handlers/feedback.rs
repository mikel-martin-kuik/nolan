//! Feedback and feature request HTTP handlers

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::commands::feedback;

/// Error response
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, message: String) -> impl IntoResponse {
    (status, Json(ErrorResponse { error: message }))
}

// ============================================================================
// Feature Requests
// ============================================================================

/// List all feature requests
pub async fn list_requests() -> Result<Json<Vec<feedback::FeatureRequest>>, impl IntoResponse> {
    match feedback::list_feature_requests() {
        Ok(requests) => Ok(Json(requests)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct CreateRequestBody {
    pub title: String,
    pub description: String,
    pub author: Option<String>,
}

/// Create a new feature request
pub async fn create_request(
    Json(body): Json<CreateRequestBody>,
) -> Result<Json<feedback::FeatureRequest>, impl IntoResponse> {
    match feedback::create_feature_request(body.title, body.description, body.author) {
        Ok(request) => Ok(Json(request)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct UpdateStatusBody {
    pub status: String,
}

/// Update feature request status
pub async fn update_status(
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusBody>,
) -> Result<Json<feedback::FeatureRequest>, impl IntoResponse> {
    match feedback::update_feature_request_status(id, body.status) {
        Ok(request) => Ok(Json(request)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

#[derive(Deserialize)]
pub struct VoteBody {
    pub vote_type: String,
}

/// Vote on a feature request
pub async fn vote(
    Path(id): Path<String>,
    Json(body): Json<VoteBody>,
) -> Result<Json<feedback::FeatureRequest>, impl IntoResponse> {
    match feedback::vote_feature_request(id, body.vote_type) {
        Ok(request) => Ok(Json(request)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete a feature request
pub async fn delete_request(Path(id): Path<String>) -> Result<Json<()>, impl IntoResponse> {
    match feedback::delete_feature_request(id) {
        Ok(_) => Ok(Json(())),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ============================================================================
// Ideas
// ============================================================================

/// List all ideas
pub async fn list_ideas() -> Result<Json<Vec<feedback::Idea>>, impl IntoResponse> {
    match feedback::list_ideas() {
        Ok(ideas) => Ok(Json(ideas)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct CreateIdeaBody {
    pub title: String,
    pub description: String,
    pub created_by: Option<String>,
}

/// Create a new idea
pub async fn create_idea(
    Json(body): Json<CreateIdeaBody>,
) -> Result<Json<feedback::Idea>, impl IntoResponse> {
    match feedback::create_idea(body.title, body.description, body.created_by) {
        Ok(idea) => Ok(Json(idea)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Update idea status
pub async fn update_idea_status(
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusBody>,
) -> Result<Json<feedback::Idea>, impl IntoResponse> {
    match feedback::update_idea_status(id, body.status) {
        Ok(idea) => Ok(Json(idea)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete an idea
pub async fn delete_idea(Path(id): Path<String>) -> Result<Json<()>, impl IntoResponse> {
    match feedback::delete_idea(id) {
        Ok(_) => Ok(Json(())),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ============================================================================
// Stats
// ============================================================================

/// Get feedback stats
pub async fn get_stats() -> Result<Json<feedback::FeedbackStats>, impl IntoResponse> {
    match feedback::get_feedback_stats() {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Get user's votes
pub async fn get_user_votes() -> Result<Json<HashMap<String, String>>, impl IntoResponse> {
    match feedback::get_user_votes() {
        Ok(votes) => Ok(Json(votes)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}
