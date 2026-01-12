use tokio::sync::broadcast;
use super::types::*;

/// Event bus for system-wide event distribution
pub struct EventBus {
    sender: broadcast::Sender<SystemEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self { sender }
    }

    /// Emit an event to all subscribers
    pub fn emit(&self, event: SystemEvent) {
        // Ignore the error if there are no receivers
        let _ = self.sender.send(event);
    }

    /// Emit an event with convenience parameters
    pub fn emit_event(&self, event_type: EventType, payload: serde_json::Value, source: &str) {
        self.emit(SystemEvent::new(event_type, payload, source));
    }

    /// Subscribe to receive events
    pub fn subscribe(&self) -> broadcast::Receiver<SystemEvent> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

// Global event bus singleton
static EVENT_BUS: once_cell::sync::Lazy<EventBus> =
    once_cell::sync::Lazy::new(EventBus::new);

/// Get the global event bus instance
pub fn get_event_bus() -> &'static EventBus {
    &EVENT_BUS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_bus_emit_receive() {
        let bus = EventBus::new();
        let mut receiver = bus.subscribe();

        bus.emit_event(
            EventType::IdeaApproved,
            serde_json::json!({"idea_id": "test-123"}),
            "test"
        );

        let event = receiver.recv().await.unwrap();
        assert_eq!(event.event_type, EventType::IdeaApproved);
        assert_eq!(event.source, "test");
    }
}
