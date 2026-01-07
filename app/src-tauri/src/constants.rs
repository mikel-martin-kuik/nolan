use regex::Regex;
use once_cell::sync::Lazy;

// Agent names are now loaded from team configuration (teams/*.yaml)
// Use TeamConfig::agent_names() for team agents
// See src-tauri/src/config/mod.rs for TeamConfig implementation

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
///
/// Session naming convention:
/// - Team agents: agent-{team}-{name} (e.g., agent-default-ana, agent-sprint-bill)
///   Each team agent has exactly one session per team.
/// - Free agents (Ralph): agent-ralph-{name} (e.g., agent-ralph-ziggy, agent-ralph-nova)
///   Ralph uses memorable names from RALPH_NAMES pool. Multiple instances allowed.
/// - Legacy (deprecated): agent-{name} (treated as team "default")

/// Matches team agent primary sessions: agent-{team}-{name}
/// Captures: group 1 = team, group 2 = agent name
/// Examples: agent-default-ana, agent-alpha-bill, agent-team2-dan
pub static RE_CORE_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z0-9]+)-([a-z]+)$")
        .expect("Invalid regex pattern for team agent primary session")
});

/// DEPRECATED: Matches legacy numbered team agent sessions: agent-{team}-{name}-{instance}
/// Team agents now have exactly one session per team. This pattern exists only for
/// backward compatibility to handle orphaned sessions from the old multi-instance model.
/// Captures: group 1 = team, group 2 = agent name, group 3 = instance id
/// Examples: agent-default-ana-2, agent-alpha-bill-3 (orphaned)
pub static RE_SPAWNED_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z0-9]+)-([a-z]+)-([a-z0-9]+)$")
        .expect("Invalid regex pattern for legacy numbered team agent")
});

/// Matches any team agent session (includes deprecated numbered instances for compatibility)
/// Captures: group 1 = team, group 2 = agent name, group 3 = optional legacy instance
/// Examples: agent-default-ana, agent-sprint-bill
pub static RE_AGENT_SESSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z0-9]+)-([a-z]+)(-[a-z0-9]+)?$")
        .expect("Invalid regex pattern for agent session")
});

/// Matches legacy agent sessions (without team prefix): agent-{name}
/// Used for backwards compatibility during migration
/// These sessions are treated as belonging to team "default"
/// Examples: agent-ana, agent-bill
pub static RE_LEGACY_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z]+)$")
        .expect("Invalid regex pattern for legacy agent")
});

/// Matches Ralph sessions (team-independent): agent-ralph-{id}
/// Ralph is a free agent not bound to any team
/// Examples: agent-ralph-ziggy, agent-ralph-nova
pub static RE_RALPH_SESSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-ralph-([a-z0-9]+)$")
        .expect("Invalid regex pattern for ralph session")
});

/// Matches team-scoped core agent target names: {team}:{name}
/// Used for message routing to core agents in a specific team
/// Examples: default:ana, alpha:bill
pub static RE_CORE_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z0-9]+):([a-z]+)$")
        .expect("Invalid regex pattern for core target")
});

/// DEPRECATED: Matches legacy numbered session target names: {team}:{name}-{instance}
/// Team agents no longer have numbered instances. Kept for backward compatibility.
/// Examples: default:ana-2, alpha:bill-3 (legacy)
pub static RE_SPAWNED_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z0-9]+):([a-z]+)-([a-z0-9]+)$")
        .expect("Invalid regex pattern for legacy numbered target")
});

/// Matches legacy target names (without team prefix): {name} or {name}-{instance}
/// Used for backwards compatibility - routes to team "default"
/// Examples: ana, bill-2
pub static RE_LEGACY_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z]+)(-[a-z0-9]+)?$")
        .expect("Invalid regex pattern for legacy target")
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
