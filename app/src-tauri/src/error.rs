use serde::Serialize;
use std::fmt;

/// Structured error type for better error handling across the application
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// Error codes for categorizing different error types
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // RPC errors
    RpcTimeout,
    RpcDisconnected,
    RpcParseError,
    RpcError,

    // File errors
    FileNotFound,
    FileReadError,
    FileWriteError,
    DirectoryNotFound,

    // Validation errors
    InvalidPath,
    SecurityViolation,
    InvalidParams,

    // Service errors
    ServiceUnavailable,
    SessionNotFound,

    // Tmux errors
    TmuxError,
    SessionExists,

    // Generic
    Unknown,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        if let Some(details) = &self.details {
            write!(f, "{:?}: {} - {}", self.code, self.message, details)
        } else {
            write!(f, "{:?}: {}", self.code, self.message)
        }
    }
}

impl std::error::Error for AppError {}

impl From<AppError> for String {
    fn from(err: AppError) -> String {
        serde_json::to_string(&err).unwrap_or_else(|_| err.message)
    }
}

// Convenience constructors
impl AppError {
    pub fn rpc_timeout() -> Self {
        Self {
            code: ErrorCode::RpcTimeout,
            message: "Python service did not respond in time".to_string(),
            details: None,
        }
    }

    pub fn rpc_error(msg: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::RpcError,
            message: msg.into(),
            details: None,
        }
    }

    pub fn file_not_found(path: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::FileNotFound,
            message: "File not found".to_string(),
            details: Some(path.into()),
        }
    }

    pub fn directory_not_found(path: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::DirectoryNotFound,
            message: "Directory not found".to_string(),
            details: Some(path.into()),
        }
    }

    pub fn invalid_path(msg: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::InvalidPath,
            message: "Invalid path".to_string(),
            details: Some(msg.into()),
        }
    }

    pub fn security_violation(msg: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::SecurityViolation,
            message: "Security violation".to_string(),
            details: Some(msg.into()),
        }
    }

    pub fn session_not_found(session_id: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::SessionNotFound,
            message: "Session not found".to_string(),
            details: Some(session_id.into()),
        }
    }

    pub fn tmux_error(msg: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::TmuxError,
            message: msg.into(),
            details: None,
        }
    }

    pub fn unknown(msg: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Unknown,
            message: msg.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

// Conversions from common error types
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match err.kind() {
            ErrorKind::NotFound => Self::file_not_found(err.to_string()),
            ErrorKind::PermissionDenied => Self::security_violation(err.to_string()),
            _ => Self::unknown(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::rpc_error(format!("JSON serialization error: {}", err))
    }
}
