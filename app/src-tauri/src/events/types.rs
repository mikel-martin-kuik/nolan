use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Re-export EventType from cronos
pub use crate::cronos::types::EventType;

/// System event for the event bus
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/events/")]
pub struct SystemEvent {
    pub event_type: EventType,
    /// JSON-encoded payload as a string (for TypeScript compatibility)
    #[ts(type = "string")]
    pub payload: serde_json::Value,
    pub timestamp: String,
    pub source: String,
}

impl SystemEvent {
    pub fn new(event_type: EventType, payload: serde_json::Value, source: &str) -> Self {
        Self {
            event_type,
            payload,
            timestamp: chrono::Utc::now().to_rfc3339(),
            source: source.to_string(),
        }
    }
}
