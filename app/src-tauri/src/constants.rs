use regex::Regex;
use once_cell::sync::Lazy;

/// Valid agent names that can be spawned/killed
/// TODO: Remove after refactoring all usage sites to use team config
pub const VALID_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo", "ralph"];

/// Core team agents (shown in status panel, launched together)
/// TODO: Remove after refactoring all usage sites to use team config
pub const CORE_AGENTS: &[&str] = &["ana", "bill", "carl", "dan", "enzo"];

/// Protected infrastructure sessions that should never be killed
pub const PROTECTED_SESSIONS: &[&str] = &["communicator", "history-log", "lifecycle"];

/// Fun names for Ralph spawned instances (used instead of numbers)
pub const RALPH_NAMES: &[&str] = &[
    "ziggy", "nova", "echo", "pixel", "cosmo", "blitz", "dash", "flux",
    "spark", "byte", "glitch", "neon", "pulse", "turbo", "zephyr", "volt",
    "axel", "chip", "droid", "frost", "gizmo", "helix", "jade", "karma",
    "luna", "mojo", "nitro", "onyx", "prism", "quark", "rogue", "sonic",
];

/// Pre-compiled regular expressions for agent session matching
/// These are compiled once at first use and cached for performance

/// Matches any agent session: agent-{name} or agent-{name}-{number} or agent-ralph-{instancename}
/// Examples: agent-ana, agent-bill-2, agent-ralph-ziggy
pub static RE_AGENT_SESSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)(-[a-z0-9]+)?$")
        .expect("Invalid regex pattern for agent session")
});

/// Matches core agent sessions: agent-{name} (without instance number/name)
/// Examples: agent-ana, agent-bill, agent-ralph
pub static RE_CORE_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)$")
        .expect("Invalid regex pattern for core agent")
});

/// Matches spawned agent sessions: agent-{name}-{number} or agent-ralph-{instancename}
/// Examples: agent-ana-2, agent-bill-3, agent-ralph-ziggy
pub static RE_SPAWNED_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)-[a-z0-9]+$")
        .expect("Invalid regex pattern for spawned agent")
});

/// Matches core agent target names: {name}
/// Used for message routing to core agents
/// Examples: ana, bill, carl
pub static RE_CORE_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)$")
        .expect("Invalid regex pattern for core target")
});

/// Matches spawned session target names: {name}-{number} or ralph-{instancename}
/// Used for message routing to spawned instances
/// Examples: ana-2, bill-3, ralph-ziggy
pub static RE_SPAWNED_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)-[a-z0-9]+$")
        .expect("Invalid regex pattern for spawned target")
});

/// Matches message delivery confirmation with sender identity
/// Format: "✓ Delivered to {agent}: MSG_SENDER_12345678"
/// - Captures full message ID (MSG_SENDER_xxxxxxxx)
pub static RE_MESSAGE_ID: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"✓ Delivered to [a-z0-9_-]+: (MSG_[A-Z]+_[a-f0-9]{8})")
        .expect("Invalid regex pattern for message ID")
});

/// Matches agent name in delivery confirmation
/// Format: "✓ Delivered to {agent}: MSG_SENDER_12345678"
pub static RE_DELIVERY_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"✓ Delivered to ([a-z0-9_-]+):")
        .expect("Invalid regex pattern for delivery agent")
});

/// Matches message ID with sender identity
/// Format: MSG_<SENDER>_<8-hex-chars>
/// - Captures sender name (group 1) and hex ID (group 2)
pub static RE_MESSAGE_ID_PARTS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"MSG_([A-Z]+)_([a-f0-9]{8})")
        .expect("Invalid regex pattern for message ID parts")
});

/// Get NOLAN_ROOT environment variable with proper error handling
/// Returns an error if NOLAN_ROOT is not set (avoiding hardcoded fallback paths)
pub fn get_nolan_root() -> Result<String, String> {
    std::env::var("NOLAN_ROOT")
        .map_err(|_| "NOLAN_ROOT environment variable not set. Please set it to your Nolan installation directory.".to_string())
}
