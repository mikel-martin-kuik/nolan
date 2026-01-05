use regex::Regex;
use once_cell::sync::Lazy;

/// Valid agent names in the Nolan team
pub const VALID_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo", "ralph"];

/// Protected infrastructure sessions that should never be killed
pub const PROTECTED_SESSIONS: &[&str] = &["communicator", "history-log", "lifecycle"];

/// Pre-compiled regular expressions for agent session matching
/// These are compiled once at first use and cached for performance

/// Matches any agent session: agent-{name} or agent-{name}-{number}
/// Examples: agent-ana, agent-bill-2, agent-carl-3
pub static RE_AGENT_SESSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)(-[0-9]+)?$")
        .expect("Invalid regex pattern for agent session")
});

/// Matches core agent sessions: agent-{name} (without instance number)
/// Examples: agent-ana, agent-bill, agent-carl
pub static RE_CORE_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)$")
        .expect("Invalid regex pattern for core agent")
});

/// Matches spawned agent sessions: agent-{name}-{number}
/// Examples: agent-ana-2, agent-bill-3, agent-carl-4
pub static RE_SPAWNED_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)-[0-9]+$")
        .expect("Invalid regex pattern for spawned agent")
});

/// Matches core agent target names: {name}
/// Used for message routing to core agents
/// Examples: ana, bill, carl
pub static RE_CORE_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)$")
        .expect("Invalid regex pattern for core target")
});

/// Matches spawned session target names: {name}-{number}
/// Used for message routing to spawned instances
/// Examples: ana-2, bill-3, carl-4
pub static RE_SPAWNED_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)-[0-9]+$")
        .expect("Invalid regex pattern for spawned target")
});

/// Matches message delivery confirmation
/// Format: "✓ Delivered to {agent}: MSG_12345678"
pub static RE_MESSAGE_ID: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"✓ Delivered to [a-z0-9_-]+: (MSG_[a-f0-9]{8})")
        .expect("Invalid regex pattern for message ID")
});

/// Matches agent name in delivery confirmation
/// Format: "✓ Delivered to {agent}: MSG_12345678"
pub static RE_DELIVERY_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"✓ Delivered to ([a-z0-9_-]+):")
        .expect("Invalid regex pattern for delivery agent")
});

/// Get NOLAN_ROOT environment variable with proper error handling
/// Returns an error if NOLAN_ROOT is not set (avoiding hardcoded fallback paths)
pub fn get_nolan_root() -> Result<String, String> {
    std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT environment variable not set. Please set it to your Nolan installation directory.".to_string())
}
