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

/// Matches team agent primary sessions: agent-{team}-{name}
/// Captures: group 1 = team, group 2 = agent name
/// Team names can contain hyphens (e.g., bug-bounty, feature-team)
/// Examples: agent-default-ana, agent-bug-bounty-carl, agent-team2-dan
pub static RE_CORE_AGENT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z][a-z0-9-]*[a-z0-9]|[a-z])-([a-z]+)$")
        .expect("Invalid regex pattern for team agent primary session")
});

/// Matches team agent sessions: agent-{team}-{name}
/// Team agents have exactly one session per team.
/// Team names can contain hyphens (e.g., bug-bounty, feature-team)
/// Captures: group 1 = team, group 2 = agent name
/// Examples: agent-default-ana, agent-bug-bounty-carl
pub static RE_AGENT_SESSION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^agent-([a-z][a-z0-9-]*[a-z0-9]|[a-z])-([a-z]+)$")
        .expect("Invalid regex pattern for agent session")
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
/// Team names can contain hyphens (e.g., bug-bounty:ana)
/// Examples: default:ana, bug-bounty:carl
pub static RE_CORE_TARGET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([a-z][a-z0-9-]*[a-z0-9]|[a-z]):([a-z]+)$")
        .expect("Invalid regex pattern for core target")
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

// =============================================================================
// Agent Naming Utilities
// =============================================================================
// Centralized functions for generating consistent agent session and directory names.
// Use these functions instead of inline format! strings to ensure naming consistency.

/// Generate session name for a team agent
/// Format: agent-{team}-{name}
/// Example: team_agent_session("default", "ana") -> "agent-default-ana"
pub fn team_agent_session(team: &str, agent: &str) -> String {
    format!("agent-{}-{}", team, agent)
}

/// Generate session name for a Ralph agent
/// Format: agent-ralph-{name}
/// Example: ralph_session("ziggy") -> "agent-ralph-ziggy"
pub fn ralph_session(name: &str) -> String {
    format!("agent-ralph-{}", name)
}

/// Generate directory name for a Ralph agent
/// Format: agent-ralph-{name} (matches session name for consistency)
/// Example: ralph_directory("ziggy") -> "agent-ralph-ziggy"
pub fn ralph_directory(name: &str) -> String {
    format!("agent-ralph-{}", name)
}

/// Check if a session name is a Ralph session
/// Returns the ralph name if it matches, None otherwise
/// Note: Only accepts lowercase letters and digits to match RE_RALPH_SESSION regex pattern
pub fn parse_ralph_session(session: &str) -> Option<&str> {
    session.strip_prefix("agent-ralph-")
        .filter(|name| !name.is_empty() && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

/// Check if a session name is a team agent session
/// Returns (team, agent_name) if it matches, None otherwise
pub fn parse_team_session(session: &str) -> Option<(String, String)> {
    RE_CORE_AGENT.captures(session)
        .map(|caps| (caps[1].to_string(), caps[2].to_string()))
}

/// Check if a name is in the Ralph names pool
pub fn is_ralph_name(name: &str) -> bool {
    RALPH_NAMES.contains(&name)
}
