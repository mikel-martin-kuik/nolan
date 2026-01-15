//! Feedback and feature request HTTP handlers

use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
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

// ============================================================================
// Idea Reviews
// ============================================================================

/// List all idea reviews
pub async fn list_idea_reviews() -> Result<Json<Vec<feedback::IdeaReview>>, impl IntoResponse> {
    match feedback::list_idea_reviews() {
        Ok(reviews) => Ok(Json(reviews)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct UpdateIdeaBody {
    pub title: String,
    pub description: String,
}

/// Update an idea's title and description
pub async fn update_idea(
    Path(id): Path<String>,
    Json(body): Json<UpdateIdeaBody>,
) -> Result<Json<feedback::Idea>, impl IntoResponse> {
    match feedback::update_idea(id, body.title, body.description) {
        Ok(idea) => Ok(Json(idea)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Accept a review proposal and route based on complexity
pub async fn accept_review(Path(item_id): Path<String>) -> impl IntoResponse {
    // First accept the review
    let review = match feedback::accept_review(item_id.clone()) {
        Ok(r) => r,
        Err(e) => return error_response(StatusCode::BAD_REQUEST, e).into_response(),
    };

    // Then route based on complexity
    let route_result = match crate::scheduler::commands::route_accepted_idea(item_id).await {
        Ok(r) => r,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    Json(AcceptReviewResponse {
        review,
        route: route_result.route,
        route_detail: route_result.detail,
    })
    .into_response()
}

#[derive(serde::Serialize)]
pub struct AcceptReviewResponse {
    pub review: feedback::IdeaReview,
    pub route: String,
    pub route_detail: String,
}

#[derive(Deserialize)]
pub struct UpdateProposalBody {
    pub proposal: feedback::IdeaProposal,
}

/// Update a review's proposal
pub async fn update_review_proposal(
    Path(item_id): Path<String>,
    Json(body): Json<UpdateProposalBody>,
) -> Result<Json<feedback::IdeaReview>, impl IntoResponse> {
    match feedback::update_review_proposal(item_id, body.proposal) {
        Ok(review) => Ok(Json(review)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

#[derive(Deserialize)]
pub struct UpdateGapsBody {
    pub gaps: Vec<feedback::IdeaGap>,
}

/// Update a review's gaps
pub async fn update_review_gaps(
    Path(item_id): Path<String>,
    Json(body): Json<UpdateGapsBody>,
) -> Result<Json<feedback::IdeaReview>, impl IntoResponse> {
    match feedback::update_review_gaps(item_id, body.gaps) {
        Ok(review) => Ok(Json(review)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

// ============================================================================
// Hotfixes - Simple fixes that bypass the full idea pipeline
// ============================================================================

/// List all hotfixes
pub async fn list_hotfixes() -> Result<Json<Vec<feedback::Hotfix>>, impl IntoResponse> {
    match feedback::list_hotfixes() {
        Ok(hotfixes) => Ok(Json(hotfixes)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct CreateHotfixBody {
    pub title: String,
    pub description: String,
    pub scope: Option<Vec<String>>,
    pub created_by: Option<String>,
}

/// Create a new hotfix
pub async fn create_hotfix(
    Json(body): Json<CreateHotfixBody>,
) -> Result<Json<feedback::Hotfix>, impl IntoResponse> {
    match feedback::create_hotfix(body.title, body.description, body.scope, body.created_by) {
        Ok(hotfix) => Ok(Json(hotfix)),
        Err(e) => Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
pub struct UpdateHotfixBody {
    pub title: Option<String>,
    pub description: Option<String>,
    pub scope: Option<Vec<String>>,
}

/// Update a hotfix
pub async fn update_hotfix(
    Path(id): Path<String>,
    Json(body): Json<UpdateHotfixBody>,
) -> Result<Json<feedback::Hotfix>, impl IntoResponse> {
    match feedback::update_hotfix(id, body.title, body.description, body.scope) {
        Ok(hotfix) => Ok(Json(hotfix)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

#[derive(Deserialize)]
pub struct UpdateHotfixStatusBody {
    pub status: String,
}

/// Update hotfix status
pub async fn update_hotfix_status(
    Path(id): Path<String>,
    Json(body): Json<UpdateHotfixStatusBody>,
) -> Result<Json<feedback::Hotfix>, impl IntoResponse> {
    match feedback::update_hotfix_status(id, body.status) {
        Ok(hotfix) => Ok(Json(hotfix)),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}

/// Delete a hotfix
pub async fn delete_hotfix(Path(id): Path<String>) -> Result<Json<()>, impl IntoResponse> {
    match feedback::delete_hotfix(id) {
        Ok(_) => Ok(Json(())),
        Err(e) => Err(error_response(StatusCode::BAD_REQUEST, e)),
    }
}
