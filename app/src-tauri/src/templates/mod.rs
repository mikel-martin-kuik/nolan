//! Embedded agent templates
//!
//! Templates are bundled in the binary and can be installed by users
//! to create actual agents in ~/.nolan/agents/

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Embedded template for an agent
pub struct AgentTemplate {
    pub name: &'static str,
    pub agent_yaml: &'static str,
    pub claude_md: &'static str,
}

/// Template info returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateInfo {
    pub name: String,
    pub description: String,
    pub model: String,
    pub command: Option<String>,
    pub role: String,
    pub installed: bool,
}

/// All agent templates embedded in the binary
/// Templates are stored in src-tauri/templates/{name}/ with agent.yaml and CLAUDE.md
pub static PREDEFINED_TEMPLATES: &[AgentTemplate] = &[
    AgentTemplate {
        name: "build-nolan",
        agent_yaml: include_str!("../../templates/build-nolan/agent.yaml"),
        claude_md: include_str!("../../templates/build-nolan/CLAUDE.md"),
    },
    AgentTemplate {
        name: "deploy-nolan",
        agent_yaml: include_str!("../../templates/deploy-nolan/agent.yaml"),
        claude_md: include_str!("../../templates/deploy-nolan/CLAUDE.md"),
    },
    AgentTemplate {
        name: "git-commit",
        agent_yaml: include_str!("../../templates/git-commit/agent.yaml"),
        claude_md: include_str!("../../templates/git-commit/CLAUDE.md"),
    },
    AgentTemplate {
        name: "idea-analyzer",
        agent_yaml: include_str!("../../templates/idea-analyzer/agent.yaml"),
        claude_md: include_str!("../../templates/idea-analyzer/CLAUDE.md"),
    },
    AgentTemplate {
        name: "merge-changes",
        agent_yaml: include_str!("../../templates/merge-changes/agent.yaml"),
        claude_md: include_str!("../../templates/merge-changes/CLAUDE.md"),
    },
    AgentTemplate {
        name: "phase-validator",
        agent_yaml: include_str!("../../templates/phase-validator/agent.yaml"),
        claude_md: include_str!("../../templates/phase-validator/CLAUDE.md"),
    },
    AgentTemplate {
        name: "qa-validation",
        agent_yaml: include_str!("../../templates/qa-validation/agent.yaml"),
        claude_md: include_str!("../../templates/qa-validation/CLAUDE.md"),
    },
    AgentTemplate {
        name: "quick-fix",
        agent_yaml: include_str!("../../templates/quick-fix/agent.yaml"),
        claude_md: include_str!("../../templates/quick-fix/CLAUDE.md"),
    },
    AgentTemplate {
        name: "research",
        agent_yaml: include_str!("../../templates/research/agent.yaml"),
        claude_md: include_str!("../../templates/research/CLAUDE.md"),
    },
    AgentTemplate {
        name: "security-scan",
        agent_yaml: include_str!("../../templates/security-scan/agent.yaml"),
        claude_md: include_str!("../../templates/security-scan/CLAUDE.md"),
    },
];

/// Helper to parse description, model, command, and role from agent.yaml
fn parse_agent_yaml(yaml: &str) -> (String, String, Option<String>, String) {
    #[derive(Deserialize)]
    struct AgentYaml {
        description: Option<String>,
        model: Option<String>,
        invocation: Option<Invocation>,
        role: Option<String>,
    }
    #[derive(Deserialize)]
    struct Invocation {
        command: Option<String>,
    }

    match serde_yaml::from_str::<AgentYaml>(yaml) {
        Ok(parsed) => (
            parsed.description.unwrap_or_default(),
            parsed.model.unwrap_or_else(|| "sonnet".to_string()),
            parsed.invocation.and_then(|i| i.command),
            parsed.role.unwrap_or_else(|| "free".to_string()),
        ),
        Err(_) => (
            String::new(),
            "sonnet".to_string(),
            None,
            "free".to_string(),
        ),
    }
}

/// Convert role string to directory name (pluralized)
fn role_to_dir(role: &str) -> &str {
    match role {
        "implementer" => "implementers",
        "analyzer" => "analyzers",
        "tester" => "testers",
        "merger" => "mergers",
        "builder" => "builders",
        "scanner" => "scanners",
        "indexer" => "indexers",
        "monitor" => "monitors",
        "researcher" => "researchers",
        "planner" => "planners",
        "free" => "free",
        _ => "free",
    }
}

/// List all available templates with their install status
pub fn list_templates(agents_dir: &Path) -> Vec<TemplateInfo> {
    PREDEFINED_TEMPLATES
        .iter()
        .map(|t| {
            let (description, model, command, role) = parse_agent_yaml(t.agent_yaml);
            let role_dir = role_to_dir(&role);

            // Check if installed in the role subdirectory (new structure)
            let role_path = agents_dir.join(role_dir).join(t.name);
            // Also check legacy flat structure (for backwards compatibility)
            let legacy_path = agents_dir.join(t.name);
            let installed = role_path.exists() || legacy_path.exists();

            TemplateInfo {
                name: t.name.to_string(),
                description,
                model,
                command,
                role,
                installed,
            }
        })
        .collect()
}

/// Install a template to the agents directory
/// Installs to the correct role subdirectory (e.g., scanners/security-scan/)
/// Returns error if already installed (use uninstall first)
pub fn install_template(name: &str, agents_dir: &Path) -> Result<(), String> {
    let template = PREDEFINED_TEMPLATES
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| format!("Template '{}' not found", name))?;

    // Parse role from agent.yaml
    let (_, _, _, role) = parse_agent_yaml(template.agent_yaml);
    let role_dir = role_to_dir(&role);

    // Install to role subdirectory
    let agent_dir = agents_dir.join(role_dir).join(name);

    if agent_dir.exists() {
        return Err(format!(
            "Agent '{}' already installed. Uninstall first to reinstall.",
            name
        ));
    }

    std::fs::create_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    std::fs::write(agent_dir.join("agent.yaml"), template.agent_yaml)
        .map_err(|e| format!("Failed to write agent.yaml: {}", e))?;

    std::fs::write(agent_dir.join("CLAUDE.md"), template.claude_md)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok(())
}

/// Uninstall an agent (remove from agents directory)
/// Checks role subdirectory based on template's role
pub fn uninstall_template(name: &str, agents_dir: &Path) -> Result<(), String> {
    // Find the template to get its role
    let template = PREDEFINED_TEMPLATES
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| format!("Template '{}' not found", name))?;

    let (_, _, _, role) = parse_agent_yaml(template.agent_yaml);
    let role_dir = role_to_dir(&role);
    let agent_dir = agents_dir.join(role_dir).join(name);

    if !agent_dir.exists() {
        return Err(format!("Agent '{}' is not installed", name));
    }

    std::fs::remove_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to remove agent directory: {}", e))?;

    Ok(())
}
