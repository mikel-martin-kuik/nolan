//! Authentication middleware and helpers
//!
//! Provides password-based authentication with session tokens.
//! Password is stored as Argon2 hash in ~/.nolan/server-password.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Active session tokens (in-memory, cleared on restart)
pub type SessionStore = Arc<RwLock<HashSet<String>>>;

/// Create a new session store
pub fn new_session_store() -> SessionStore {
    Arc::new(RwLock::new(HashSet::new()))
}

/// Get path to password file
fn get_password_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".nolan")
        .join("server-password")
}

/// Check if password is configured
pub fn is_password_configured() -> bool {
    get_password_path().exists()
}

/// Check if authentication is required
/// Auth is required if:
/// - Password is configured (user explicitly set one), OR
/// - Binding to non-localhost (network exposure)
pub fn is_auth_required() -> bool {
    // If password is configured, always require auth
    if is_password_configured() {
        return true;
    }
    // Also require auth if binding to network
    let host = std::env::var("NOLAN_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    host != "127.0.0.1" && host != "localhost" && host != "::1"
}

/// Set up initial password
pub fn setup_password(password: &str) -> Result<(), String> {
    let password_path = get_password_path();

    // Create parent directory
    if let Some(parent) = password_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .nolan directory: {}", e))?;
    }

    // Hash password with Argon2
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    // Write hash to file
    std::fs::write(&password_path, &hash)
        .map_err(|e| format!("Failed to write password file: {}", e))?;

    // Set secure permissions (0600 - owner read/write only)
    std::fs::set_permissions(&password_path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("Failed to set password file permissions: {}", e))?;

    Ok(())
}

/// Verify password against stored hash
pub fn verify_password(password: &str) -> Result<bool, String> {
    let password_path = get_password_path();

    let stored_hash = std::fs::read_to_string(&password_path)
        .map_err(|_| "No password configured".to_string())?;

    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| format!("Invalid stored hash: {}", e))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Generate a random session token
pub fn generate_session_token() -> String {
    let token: [u8; 32] = rand::thread_rng().gen();
    hex::encode(token)
}

/// Shared auth state
#[derive(Clone)]
pub struct AuthState {
    pub sessions: SessionStore,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            sessions: new_session_store(),
        }
    }
}

/// Authentication middleware
///
/// Checks for valid session token in:
/// 1. `Authorization: Bearer <token>` header
/// 2. `X-Nolan-Session` header
///
/// Bypasses auth for:
/// - `/api/auth/*` routes
/// - `/api/health` endpoint
/// - Localhost requests when no password is configured
pub async fn auth_middleware(
    State(auth_state): State<AuthState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let path = request.uri().path();

    // Skip auth for auth routes and health check
    if path.starts_with("/api/auth") || path == "/api/health" {
        return next.run(request).await;
    }

    // Skip auth if not required (localhost + no password)
    if !is_auth_required() && !is_password_configured() {
        return next.run(request).await;
    }

    // Extract session token from headers only (no query params for security)
    let token = extract_session_token(&request);

    if let Some(token) = token {
        let sessions = auth_state.sessions.read().await;
        if sessions.contains(&token) {
            return next.run(request).await;
        }
    }

    // Authentication failed
    (StatusCode::UNAUTHORIZED, "Authentication required").into_response()
}

fn extract_session_token(request: &Request<Body>) -> Option<String> {
    // Check Authorization header
    if let Some(auth) = request.headers().get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            if auth_str.starts_with("Bearer ") {
                return Some(auth_str[7..].to_string());
            }
        }
    }

    // Check X-Nolan-Session header
    if let Some(session) = request.headers().get("x-nolan-session") {
        if let Ok(session_str) = session.to_str() {
            return Some(session_str.to_string());
        }
    }

    // NOTE: Query parameter extraction intentionally removed for security
    // (tokens in URLs are logged in access logs and browser history)

    None
}

// Auth route handlers

#[derive(Deserialize)]
pub struct LoginRequest {
    password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    session_token: String,
}

#[derive(Serialize)]
pub struct AuthStatusResponse {
    authenticated: bool,
    auth_required: bool,
    password_configured: bool,
}

pub async fn login(
    State(auth_state): State<AuthState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    match verify_password(&req.password) {
        Ok(true) => {
            let token = generate_session_token();
            auth_state.sessions.write().await.insert(token.clone());
            Ok(Json(LoginResponse { session_token: token }))
        }
        Ok(false) => Err((StatusCode::UNAUTHORIZED, "Invalid password".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

pub async fn logout(
    State(auth_state): State<AuthState>,
    request: Request<Body>,
) -> StatusCode {
    if let Some(token) = extract_session_token(&request) {
        auth_state.sessions.write().await.remove(&token);
    }
    StatusCode::OK
}

pub async fn get_auth_status() -> Json<AuthStatusResponse> {
    Json(AuthStatusResponse {
        authenticated: false, // Will be true if middleware passed
        auth_required: is_auth_required(),
        password_configured: is_password_configured(),
    })
}

#[derive(Deserialize)]
pub struct SetupPasswordRequest {
    password: String,
}

pub async fn setup_password_handler(
    Json(req): Json<SetupPasswordRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    if is_password_configured() {
        return Err((StatusCode::CONFLICT, "Password already configured".to_string()));
    }

    if req.password.len() < 8 {
        return Err((StatusCode::BAD_REQUEST, "Password must be at least 8 characters".to_string()));
    }

    setup_password(&req.password)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(StatusCode::CREATED)
}
