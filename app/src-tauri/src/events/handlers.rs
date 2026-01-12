use std::collections::HashMap;
use std::time::Instant;
use tokio::sync::RwLock;

use super::bus::get_event_bus;
use super::types::*;
use crate::cronos::types::{AgentType, EventTrigger};

/// Debounce tracker for event agents
struct DebounceTracker {
    last_triggered: HashMap<String, Instant>,
}

impl DebounceTracker {
    fn new() -> Self {
        Self {
            last_triggered: HashMap::new(),
        }
    }

    /// Check if agent can be triggered (debounce check)
    fn can_trigger(&mut self, agent_name: &str, debounce_ms: u32) -> bool {
        let now = Instant::now();

        if let Some(last) = self.last_triggered.get(agent_name) {
            let elapsed = now.duration_since(*last).as_millis() as u32;
            if elapsed < debounce_ms {
                return false;
            }
        }

        self.last_triggered.insert(agent_name.to_string(), now);
        true
    }
}

static DEBOUNCE_TRACKER: once_cell::sync::Lazy<RwLock<DebounceTracker>> =
    once_cell::sync::Lazy::new(|| RwLock::new(DebounceTracker::new()));

/// Start the event listener that triggers event-driven agents
pub async fn start_event_listener() {
    let bus = get_event_bus();
    let mut receiver = bus.subscribe();

    tokio::spawn(async move {
        println!("[Events] Event listener started");

        while let Ok(event) = receiver.recv().await {
            if let Err(e) = handle_event(event).await {
                eprintln!("[Events] Handler error: {}", e);
            }
        }
    });
}

/// Handle an incoming system event
async fn handle_event(event: SystemEvent) -> Result<(), String> {
    println!("[Events] Received event: {:?} from {}", event.event_type, event.source);

    // Load all agents and find matching event agents
    let guard = crate::cronos::commands::CRONOS.read().await;
    let manager = guard.as_ref().ok_or("Cronos not initialized")?;

    let agents = manager.load_agents().await?;

    for agent in agents.iter().filter(|a| a.agent_type == AgentType::Event && a.enabled) {
        if let Some(ref trigger) = agent.event_trigger {
            if matches_event(&event, trigger) {
                // Check debounce
                let mut tracker = DEBOUNCE_TRACKER.write().await;
                if !tracker.can_trigger(&agent.name, trigger.debounce_ms) {
                    println!("[Events] Skipping {} - debounce", agent.name);
                    continue;
                }
                drop(tracker);

                // Trigger the agent
                println!("[Events] Triggering event agent: {}", agent.name);
                let agent_name = agent.name.clone();

                tokio::spawn(async move {
                    if let Err(e) = crate::cronos::commands::trigger_cron_agent_api(agent_name.clone()).await {
                        eprintln!("[Events] Failed to trigger {}: {}", agent_name, e);
                    }
                });
            }
        }
    }

    Ok(())
}

/// Check if an event matches a trigger configuration
fn matches_event(event: &SystemEvent, trigger: &EventTrigger) -> bool {
    // First check event type
    if event.event_type != trigger.event_type {
        return false;
    }

    // If pattern is specified, check against payload
    if let Some(ref pattern) = trigger.pattern {
        // Convert payload to string for pattern matching
        let payload_str = event.payload.to_string();

        // Simple glob-like pattern matching
        // For more complex patterns, could use regex crate
        if pattern.contains('*') {
            // Simple wildcard matching
            let parts: Vec<&str> = pattern.split('*').collect();
            let mut remaining = payload_str.as_str();

            for (i, part) in parts.iter().enumerate() {
                if part.is_empty() {
                    continue;
                }

                if i == 0 {
                    // First part must match from start
                    if !remaining.starts_with(part) {
                        return false;
                    }
                    remaining = &remaining[part.len()..];
                } else if i == parts.len() - 1 {
                    // Last part must match at end
                    if !remaining.ends_with(part) {
                        return false;
                    }
                } else {
                    // Middle parts must exist somewhere
                    if let Some(pos) = remaining.find(part) {
                        remaining = &remaining[pos + part.len()..];
                    } else {
                        return false;
                    }
                }
            }
        } else {
            // Exact match
            if !payload_str.contains(pattern) {
                return false;
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_event_basic() {
        let event = SystemEvent {
            event_type: EventType::IdeaApproved,
            payload: serde_json::json!({"idea_id": "test-123"}),
            timestamp: "2026-01-12T00:00:00Z".to_string(),
            source: "test".to_string(),
        };

        let trigger = EventTrigger {
            event_type: EventType::IdeaApproved,
            pattern: None,
            debounce_ms: 1000,
        };

        assert!(matches_event(&event, &trigger));

        // Different event type should not match
        let wrong_trigger = EventTrigger {
            event_type: EventType::GitPush,
            pattern: None,
            debounce_ms: 1000,
        };

        assert!(!matches_event(&event, &wrong_trigger));
    }

    #[test]
    fn test_matches_event_with_pattern() {
        let event = SystemEvent {
            event_type: EventType::FileChanged,
            payload: serde_json::json!({"file": "/home/user/project/src/main.rs"}),
            timestamp: "2026-01-12T00:00:00Z".to_string(),
            source: "test".to_string(),
        };

        // Pattern should match
        let trigger = EventTrigger {
            event_type: EventType::FileChanged,
            pattern: Some("*.rs".to_string()),
            debounce_ms: 1000,
        };

        assert!(matches_event(&event, &trigger));

        // Pattern should not match
        let wrong_trigger = EventTrigger {
            event_type: EventType::FileChanged,
            pattern: Some("*.py".to_string()),
            debounce_ms: 1000,
        };

        assert!(!matches_event(&event, &wrong_trigger));
    }
}
