//! lifecycle_status.rs
//!
//! Agent status monitoring and statusline parsing.
//! Provides real-time status information for all agents.
//!
//! See docs/AI_ARCHITECTURE.md for guidelines.

use crate::config::TeamConfig;
use crate::constants::RE_RALPH_SESSION;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

// === CACHED REGEX PATTERNS ===

/// Cached regex for new statusline format: "agent | model | XX% | $Y | project"
pub static RE_STATUSLINE_NEW: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"^\s+[^|]+\|[^|]+\|\s*(\d+)%\s*\|[^|]+\|\s*(\S+)\s*$").ok());

/// Cached regex for old statusline format (no project)
pub static RE_STATUSLINE_OLD: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"^\s+\w+\s+\|\s+[\w\s.]+\s+\|\s+(\d+)%").ok());

// === DATA STRUCTURES ===

/// Parsed status line data
pub struct StatusLineData {
    pub context_usage: Option<u8>,
    pub current_project: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct AgentStatusList {
    pub team: Vec<AgentStatus>, // Agents belonging to teams (defined in team YAML config)
    pub free: Vec<AgentStatus>, // Free agents not bound to any team (e.g., ralph)
}

#[derive(Clone, Serialize)]
pub struct AgentStatus {
    pub name: String,
    pub team: String, // Team this agent belongs to (empty for ralph)
    pub active: bool,
    pub session: String,
    pub attached: bool,
    pub context_usage: Option<u8>, // Context window usage percentage (0-100)
    pub current_project: Option<String>, // Current project from statusline (None if VIBING)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<u64>, // Unix timestamp in milliseconds (for spawned agents)
}

// === STATUSLINE PARSING ===

/// Parse status line data from Claude statusline
/// Expected format: "  {agent} | {model} | {percentage}% | ${cost} | {project}"
pub fn parse_statusline(session: &str) -> StatusLineData {
    use std::process::Command;

    let mut data = StatusLineData {
        context_usage: None,
        current_project: None,
    };

    // Capture last 5 lines from tmux pane
    let output = match Command::new("tmux")
        .args(&["capture-pane", "-t", session, "-p", "-S", "-5"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return data,
    };

    let content = String::from_utf8_lossy(&output.stdout);

    // Use cached regex patterns (compiled once at startup)
    for line in content.lines().rev() {
        // Try new format with project
        if let Some(ref re) = *RE_STATUSLINE_NEW {
            if let Some(caps) = re.captures(line) {
                if let Ok(percentage) = caps[1].parse::<u8>() {
                    data.context_usage = Some(percentage);
                }
                let project = caps[2].to_string();
                if project != "VIBING" {
                    data.current_project = Some(project);
                }
                break;
            }
        }

        // Fallback to old format (no project)
        if let Some(ref re) = *RE_STATUSLINE_OLD {
            if let Some(caps) = re.captures(line) {
                if let Ok(percentage) = caps[1].parse::<u8>() {
                    data.context_usage = Some(percentage);
                }
                break;
            }
        }
    }

    data
}

// === STATUS QUERIES ===

/// Get status of all agents
#[tauri::command]
pub async fn get_agent_status() -> Result<AgentStatusList, String> {
    use std::collections::HashMap;

    let sessions = crate::tmux::session::list_sessions()?;

    // Load all available team configs
    let available_teams = list_available_teams()?;
    let mut team_configs: HashMap<String, TeamConfig> = HashMap::new();
    for team_name in &available_teams {
        if let Ok(config) = TeamConfig::load(team_name) {
            team_configs.insert(team_name.clone(), config);
        }
    }

    // Filter to agent-* sessions only
    let mut team_agents = Vec::new();
    let mut free_agents = Vec::new();

    for session in &sessions {
        if !session.starts_with("agent-") {
            continue;
        }

        // Check for Ralph sessions first (team-independent free agent): agent-ralph-{id}
        if RE_RALPH_SESSION.is_match(session) {
            if let Ok(info) = crate::tmux::session::get_session_info(session) {
                let statusline = parse_statusline(session);
                free_agents.push(AgentStatus {
                    name: "ralph".to_string(),
                    team: "".to_string(), // Ralph is team-independent (free agent)
                    active: true,
                    session: session.clone(),
                    attached: info.attached,
                    context_usage: statusline.context_usage,
                    current_project: statusline.current_project,
                    created_at: Some(info.created_at * 1000),
                });
            }
            continue;
        }

        // Check for team-scoped agent: agent-{team}-{name} (base session)
        // Use config-based lookup to support agent names with underscores (e.g., ea_architect)
        let mut matched = false;
        for (team_name, team_config) in &team_configs {
            let prefix = format!("agent-{}-", team_name);
            if session.starts_with(&prefix) {
                let agent_name = &session[prefix.len()..];
                // Validate agent exists in team config
                if team_config.agent_names().contains(&agent_name) {
                    if let Ok(info) = crate::tmux::session::get_session_info(session) {
                        let statusline = parse_statusline(session);
                        team_agents.push(AgentStatus {
                            name: agent_name.to_string(),
                            team: team_name.clone(),
                            active: true,
                            session: session.clone(),
                            attached: info.attached,
                            context_usage: statusline.context_usage,
                            current_project: statusline.current_project,
                            created_at: Some(info.created_at * 1000),
                        });
                    }
                    matched = true;
                    break;
                }
            }
        }
        if matched {
            continue;
        }
    }

    // Add inactive team agents for each team (all agents in team config)
    for (team_name, team_config) in &team_configs {
        for agent in team_config.agent_names() {
            let session_name = format!("agent-{}-{}", team_name, agent);
            // Check if this team-agent combo already has an active session
            if !team_agents
                .iter()
                .any(|a| a.team == *team_name && a.name == agent && a.session == session_name)
            {
                team_agents.push(AgentStatus {
                    name: agent.to_string(),
                    team: team_name.clone(),
                    active: false,
                    session: session_name,
                    attached: false,
                    context_usage: None,
                    current_project: None,
                    created_at: None,
                });
            }
        }
    }

    // Sort team agents by team, then by name, then by session
    team_agents.sort_by(|a, b| match a.team.cmp(&b.team) {
        std::cmp::Ordering::Equal => match a.name.cmp(&b.name) {
            std::cmp::Ordering::Equal => a.session.cmp(&b.session),
            other => other,
        },
        other => other,
    });

    // Sort free agents by name, then by session
    free_agents.sort_by(|a, b| match a.name.cmp(&b.name) {
        std::cmp::Ordering::Equal => a.session.cmp(&b.session),
        other => other,
    });

    Ok(AgentStatusList {
        team: team_agents,
        free: free_agents,
    })
}

/// List available team names from teams directory
/// Format: teams/{team_name}/team.yaml
pub fn list_available_teams() -> Result<Vec<String>, String> {
    let teams_dir = crate::utils::paths::get_teams_dir()?;

    let mut teams = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&teams_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                let team_yaml = path.join("team.yaml");
                if team_yaml.exists() {
                    if let Some(team_name) = path.file_name().and_then(|s| s.to_str()) {
                        teams.push(team_name.to_string());
                    }
                }
            }
        }
    }
    Ok(teams)
}
