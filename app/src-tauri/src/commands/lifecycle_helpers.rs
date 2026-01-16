//! lifecycle_helpers.rs
//!
//! Foundation helpers for lifecycle operations.
//! Contains validation, state management, session registration, and config loading.
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use crate::config::TeamConfig;
use crate::constants::{parse_ralph_session, PROTECTED_SESSIONS, RE_AGENT_SESSION, RE_RALPH_SESSION};

// === VALIDATION ===

/// Validates that a session name is a valid agent session and returns (team, agent) tuple
/// Supports:
/// - Team-scoped sessions: agent-{team}-{name} or agent-{team}-{name}-{instance}
/// - Ralph sessions: agent-ralph-{id} (team-independent)
pub fn validate_agent_session(session: &str) -> Result<(String, String), String> {
    // Prevent killing protected infrastructure
    if PROTECTED_SESSIONS.iter().any(|p| session.contains(p)) {
        return Err(format!(
            "Cannot operate on protected infrastructure session: '{}'",
            session
        ));
    }

    // Check Ralph sessions first (team-independent)
    if RE_RALPH_SESSION.is_match(session) {
        return Ok(("".to_string(), "ralph".to_string()));
    }

    // Try team-scoped pattern: agent-{team}-{name}[-{instance}]
    if let Some(caps) = RE_AGENT_SESSION.captures(session) {
        let team_name = caps[1].to_string();
        let agent_name = caps[2].to_string();

        // Validate team exists
        let team = TeamConfig::load(&team_name)
            .map_err(|e| format!("Invalid team '{}': {}", team_name, e))?;

        // Validate agent name against team config
        let valid_agents = team.agent_names();
        if !valid_agents.contains(&agent_name.as_str()) {
            return Err(format!(
                "Invalid agent '{}' for team '{}'. Valid agents: {:?}",
                agent_name, team_name, valid_agents
            ));
        }

        return Ok((team_name, agent_name));
    }

    Err(format!(
        "Invalid session name format: '{}'. Expected: agent-{{team}}-{{name}} or agent-ralph-{{name}}",
        session
    ))
}

/// Validates agent name format (lowercase letters, digits, and underscores)
/// Must start with a lowercase letter.
/// Note: Hyphens are reserved as delimiters in session names.
/// Used for operations on shared agent directories.
pub fn validate_agent_name_format(agent: &str) -> Result<(), String> {
    if agent.is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }

    if !agent
        .chars()
        .next()
        .map(|c| c.is_ascii_lowercase())
        .unwrap_or(false)
    {
        return Err(format!(
            "Invalid agent name '{}'. Must start with a lowercase letter.",
            agent
        ));
    }

    if !agent
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(format!(
            "Invalid agent name '{}'. Must contain only lowercase letters, digits, and underscores.",
            agent
        ));
    }

    Ok(())
}

// === STATE MANAGEMENT ===

/// Maximum Ralph instances allowed
pub const MAX_INSTANCES: u32 = 15;

/// Get team-namespaced state directory
/// Creates the directory if it doesn't exist
pub fn get_team_state_dir(team_name: &str) -> Result<std::path::PathBuf, String> {
    use std::fs;

    let state_dir = crate::utils::paths::get_state_dir()?.join(team_name);

    // Create directory if it doesn't exist
    fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to create state directory: {}", e))?;

    Ok(state_dir)
}

/// Get path to team's active project state file
pub fn get_team_active_project_file(team_name: &str) -> Result<std::path::PathBuf, String> {
    Ok(get_team_state_dir(team_name)?.join("active-project.txt"))
}

// === SESSION REGISTRATION ===

/// Register a session in the session registry for history lookup
pub fn register_session(
    tmux_session: &str,
    agent: &str,
    agent_dir: &str,
    team: &str,
) -> Result<(), String> {
    use chrono;
    use std::fs::{create_dir_all, OpenOptions};
    use std::io::Write;

    let registry_path = crate::utils::paths::get_session_registry_path()?;
    let registry_dir = registry_path.parent()
        .ok_or("Failed to get session registry directory")?;

    // Ensure directory exists
    create_dir_all(registry_dir)
        .map_err(|e| format!("Failed to create state directory: {}", e))?;

    // Create registry entry with team tracking
    let entry = serde_json::json!({
        "tmux_session": tmux_session,
        "agent": agent,
        "agent_dir": agent_dir,
        "team": team,  // Track team association
        "start_time": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
    });

    // Append to registry file
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&registry_path)
        .map_err(|e| format!("Failed to open session registry: {}", e))?;

    writeln!(file, "{}", entry)
        .map_err(|e| format!("Failed to write to session registry: {}", e))?;

    // Also update the in-memory index used by history streaming
    crate::commands::history::update_session_index(tmux_session, agent, agent_dir);

    Ok(())
}

// === MODEL AND PROVIDER CONFIG ===

/// Default models for each agent (loaded from agent.json in agent directory)
pub fn get_default_model(agent: &str) -> String {
    get_default_model_for_team(agent, None)
}

/// Get default model for an agent, optionally searching in a specific team first
pub fn get_default_model_for_team(agent: &str, team: Option<&str>) -> String {
    use std::fs;

    // Helper to try reading model from agent.json at a path
    fn try_read_model(agent_json_path: &std::path::Path) -> Option<String> {
        if let Ok(content) = fs::read_to_string(agent_json_path) {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(model) = metadata.get("model").and_then(|m| m.as_str()) {
                    return Some(model.to_string());
                }
            }
        }
        None
    }

    // If team specified, check team-specific agent first
    if let Some(team_name) = team {
        if let Ok(team_agents_dir) = crate::utils::paths::get_team_agents_dir(team_name) {
            let agent_json_path = team_agents_dir.join(agent).join("agent.json");
            if let Some(model) = try_read_model(&agent_json_path) {
                return model;
            }
        }
    }

    // Check shared agents directory
    if let Ok(agents_dir) = crate::utils::paths::get_agents_config_dir() {
        let agent_json_path = agents_dir.join(agent).join("agent.json");
        if let Some(model) = try_read_model(&agent_json_path) {
            return model;
        }
    }

    // Search all team directories if not found yet
    if team.is_none() {
        if let Ok(teams_dir) = crate::utils::paths::get_teams_dir() {
            if let Ok(entries) = fs::read_dir(&teams_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let team_path = entry.path();
                    if team_path.is_dir() {
                        let agent_json_path =
                            team_path.join("agents").join(agent).join("agent.json");
                        if let Some(model) = try_read_model(&agent_json_path) {
                            return model;
                        }
                    }
                }
            }
        }
    }

    // Default to opus if agent.json doesn't exist or doesn't have model
    "opus".to_string()
}

/// Get the CLI provider for an agent from agent.json (similar to get_default_model_for_team)
/// Returns the provider name ("claude" or "opencode") or None to use system default
pub fn get_agent_cli_provider(agent: &str, team: Option<&str>) -> Option<String> {
    use std::fs;

    // Helper to try reading cli_provider from agent.json
    fn try_read_provider(agent_json_path: &std::path::Path) -> Option<String> {
        if let Ok(content) = fs::read_to_string(agent_json_path) {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(provider) = metadata.get("cli_provider").and_then(|p| p.as_str()) {
                    return Some(provider.to_string());
                }
            }
        }
        None
    }

    // If team specified, check team-specific agent first
    if let Some(team_name) = team {
        if let Ok(team_agents_dir) = crate::utils::paths::get_team_agents_dir(team_name) {
            let agent_json_path = team_agents_dir.join(agent).join("agent.json");
            if let Some(provider) = try_read_provider(&agent_json_path) {
                return Some(provider);
            }
        }
    }

    // Check shared agents directory
    if let Ok(agents_dir) = crate::utils::paths::get_agents_config_dir() {
        let agent_json_path = agents_dir.join(agent).join("agent.json");
        if let Some(provider) = try_read_provider(&agent_json_path) {
            return Some(provider);
        }
    }

    // Search all team directories if not found yet
    if team.is_none() {
        if let Ok(teams_dir) = crate::utils::paths::get_teams_dir() {
            if let Ok(entries) = fs::read_dir(&teams_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let team_path = entry.path();
                    if team_path.is_dir() {
                        let agent_json_path =
                            team_path.join("agents").join(agent).join("agent.json");
                        if let Some(provider) = try_read_provider(&agent_json_path) {
                            return Some(provider);
                        }
                    }
                }
            }
        }
    }

    // Return global default provider from config
    let default = crate::config::get_default_cli_provider();
    eprintln!(
        "[Lifecycle] get_agent_cli_provider({}, {:?}) -> using global default: {}",
        agent, team, default
    );
    Some(default)
}

// === PHASE DETECTION ===

/// Detect which phase to resume from by checking completed output files.
/// Returns the index of the first incomplete phase, or None if all complete.
pub fn detect_current_phase(docs_path: &std::path::Path, team: &TeamConfig) -> Option<usize> {
    let phases = &team.team.workflow.phases;

    for (index, phase) in phases.iter().enumerate() {
        let output_file = if phase.output.ends_with(".md") {
            phase.output.clone()
        } else {
            format!("{}.md", phase.output)
        };

        let file_path = docs_path.join(&output_file);

        // Check if file exists and has HANDOFF completion marker
        if !is_phase_complete(&file_path) {
            return Some(index); // First incomplete phase
        }
    }

    None // All phases complete
}

/// Check if a phase output file is complete (has HANDOFF marker)
pub fn is_phase_complete(file_path: &std::path::Path) -> bool {
    if !file_path.exists() {
        return false;
    }

    match std::fs::read_to_string(file_path) {
        Ok(content) => {
            // Look for HANDOFF completion marker
            content.contains("<!-- HANDOFF:") && content.contains(":COMPLETE")
        }
        Err(_) => false,
    }
}

/// Determine which agents are needed based on project phase status
/// Returns None if note-taker's output file doesn't exist (new project - launch all agents)
/// Returns Some(Vec<agent_names>) for existing projects based on incomplete phases
pub fn determine_needed_agents(docs_path: &std::path::Path, team: &TeamConfig) -> Option<Vec<String>> {
    use std::collections::HashSet;
    use std::fs;

    // Get note-taker from team config (no fallback - must be configured)
    let note_taker = match team.note_taker() {
        Some(name) => name.to_string(),
        None => return None, // No note-taker configured, can't determine status
    };

    // Get exception handler (escalates issues to humans)
    let exception_handler = team.exception_handler().map(|s| s.to_string());

    // Read note-taker's output file for project status
    let notes_path = docs_path.join(team.note_taker_output_file());
    let content = fs::read_to_string(&notes_path).ok()?;

    // Check if project is complete - only launch note-taker and exception handler
    if content.contains("<!-- PROJECT:STATUS:COMPLETE") {
        let mut agents = vec![note_taker.clone()];
        if let Some(ref handler) = exception_handler {
            if handler != &note_taker {
                agents.push(handler.clone());
            }
        }
        return Some(agents);
    }

    // Parse Phase Status table to find incomplete phases
    // Format: | Phase | Status | Assigned | Output |
    // Use HashSet for O(1) contains checks instead of Vec O(n)
    let mut needed_agents_set: HashSet<String> = HashSet::new();

    // Always include note-taker (dan) and exception handler (guardian)
    needed_agents_set.insert(note_taker.clone());
    if let Some(ref handler) = exception_handler {
        needed_agents_set.insert(handler.clone());
    }

    // Build phase-to-agent mapping from team config workflow phases
    // We store exact phase names separately to prioritize exact matches
    let mut exact_phase_to_agent: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut keyword_to_agent: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for phase in &team.team.workflow.phases {
        let phase_lower = phase.name.to_lowercase();
        // Always add exact phase name (highest priority)
        exact_phase_to_agent.insert(phase_lower.clone(), phase.owner.clone());

        // Add keyword abbreviations only if they won't conflict with exact names
        // These are used as fallbacks when exact match fails
        if phase_lower.contains("research") && !exact_phase_to_agent.contains_key("research") {
            keyword_to_agent.insert("research".to_string(), phase.owner.clone());
        }
        if phase_lower.contains("plan") && !phase_lower.contains("review") {
            if !exact_phase_to_agent.contains_key("planning") {
                keyword_to_agent.insert("planning".to_string(), phase.owner.clone());
            }
            if !exact_phase_to_agent.contains_key("plan") {
                keyword_to_agent.insert("plan".to_string(), phase.owner.clone());
            }
        }
        if phase_lower.contains("implement") {
            // Don't add "implement" keyword - it causes conflicts between
            // "Implementation" (carl) and "Implementation Audit" (frank)
            // Exact phase name matching handles this correctly
        }
        if phase_lower.contains("review") || phase_lower.contains("qa") {
            if !exact_phase_to_agent.contains_key("qa") {
                keyword_to_agent.insert("qa".to_string(), phase.owner.clone());
            }
            if !exact_phase_to_agent.contains_key("qa review") {
                keyword_to_agent.insert("qa review".to_string(), phase.owner.clone());
            }
        }
    }

    // Find the Phase Status table
    let lines: Vec<&str> = content.lines().collect();
    let mut in_phase_table = false;

    for line in &lines {
        let line_lower = line.to_lowercase();

        // Detect table header
        if line_lower.contains("| phase") && line_lower.contains("| status") {
            in_phase_table = true;
            continue;
        }

        // Skip separator line
        if in_phase_table && line.starts_with("|---") {
            continue;
        }

        // End of table
        if in_phase_table && !line.starts_with('|') {
            break;
        }

        if in_phase_table {
            // Parse table row: | Phase | Status | ...
            let parts: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
            if parts.len() >= 3 {
                let phase = parts[1].to_lowercase();
                let status = parts[2].to_lowercase();

                // Check if phase is NOT complete
                let is_complete = status.contains("complete") || status.contains("✅");

                if !is_complete {
                    // Find which agent owns this phase
                    // First try exact match (handles "Implementation" vs "Implementation Audit")
                    if let Some(agent) = exact_phase_to_agent.get(&phase) {
                        needed_agents_set.insert(agent.clone());
                    } else {
                        // Fallback to keyword matching for flexibility
                        for (keyword, agent) in &keyword_to_agent {
                            if phase.contains(keyword) {
                                needed_agents_set.insert(agent.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // Safety fallback: if we only have note-taker + exception handler, launch all agents
    // This handles:
    // - No Phase Status table found in note-taker's output file
    // - All phases are complete (but no PROJECT:STATUS:COMPLETE marker)
    // - Incomplete phases found but no agents matched (phase name mismatch)
    // The minimal set (dan + guardian) should only happen when project is explicitly complete
    let base_agent_count = 1 + if exception_handler.is_some() { 1 } else { 0 };
    if needed_agents_set.len() <= base_agent_count {
        return None; // Launch all
    }

    // Find implementation agent and its QA reviewer from workflow phases
    // If implementation agent is needed, also include its QA reviewer
    let impl_phase = team.team.workflow.phases.iter().find(|p| {
        p.name.to_lowercase().contains("implement") && !p.name.to_lowercase().contains("audit")
    });
    let review_phase = team.team.workflow.phases.iter().find(|p| {
        p.name.to_lowercase().contains("review") && !p.name.to_lowercase().contains("audit")
    });

    if let (Some(impl_p), Some(review_p)) = (impl_phase, review_phase) {
        if needed_agents_set.contains(&impl_p.owner) && !needed_agents_set.contains(&review_p.owner)
        {
            needed_agents_set.insert(review_p.owner.clone());
        }
    }

    // Convert HashSet to Vec for return type
    Some(needed_agents_set.into_iter().collect())
}

// === INSTANCE MANAGEMENT ===

/// Count actual running spawned instances for an agent
/// Ralph uses ephemeral agent-ralph-{name} format, others use agent-{name}-{number}
/// Count running instances for a team-agent combination
pub fn count_running_instances(team: &str, agent: &str) -> Result<usize, String> {
    use regex::Regex;

    let sessions = crate::tmux::session::list_sessions()?;

    if agent == "ralph" {
        // For Ralph, count ephemeral instances: agent-ralph-{name} (team-independent)
        // Uses centralized parse_ralph_session for consistent validation
        Ok(sessions
            .iter()
            .filter(|s| parse_ralph_session(s).is_some())
            .count())
    } else {
        // For other agents, count team-scoped numbered instances: agent-{team}-{name}-{number}
        let pattern = format!(r"^agent-{}-{}-[0-9]+$", team, agent);
        let re = Regex::new(&pattern).map_err(|e| format!("Invalid regex pattern: {}", e))?;
        Ok(sessions.iter().filter(|s| re.is_match(s)).count())
    }
}

/// Find first available name from RALPH_NAMES pool
/// Returns a memorable name like "ziggy", "nova", etc.
/// Falls back to random alphanumeric if all 32 names are in use
pub fn find_available_ralph_name() -> Result<String, String> {
    use crate::constants::RALPH_NAMES;

    let sessions = crate::tmux::session::list_sessions()?;

    // Extract names currently in use from agent-ralph-{name} sessions
    // Uses centralized parse_ralph_session for consistent validation
    let used_names: std::collections::HashSet<&str> = sessions
        .iter()
        .filter_map(|s| parse_ralph_session(s))
        .collect();

    // Find first available name from the pool
    for name in RALPH_NAMES.iter() {
        if !used_names.contains(*name) {
            return Ok(name.to_string());
        }
    }

    // All 32 names in use, fall back to random alphanumeric
    Ok(generate_random_name())
}

/// Generate a random 5-letter alphanumeric name
/// Used as fallback when all RALPH_NAMES are exhausted
/// Returns a name that matches RE_RALPH_SESSION pattern (lowercase + digits only)
pub fn generate_random_name() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hash, Hasher};

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let random_state = RandomState::new();
    let mut hasher = random_state.build_hasher();
    now.hash(&mut hasher);
    let hash_value = hasher.finish();

    // Only lowercase letters and digits to match RE_RALPH_SESSION pattern [a-z0-9]+
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut name = String::with_capacity(5);
    let mut val = hash_value;
    for _ in 0..5 {
        name.push(CHARS[(val % 36) as usize] as char);
        val /= 36;
    }

    // Defense-in-depth: verify generated name matches expected pattern
    debug_assert!(
        name.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
        "Generated name '{}' contains invalid characters",
        name
    );

    name
}
