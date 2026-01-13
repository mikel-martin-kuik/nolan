//! Embedded agent templates
//!
//! Templates are bundled in the binary and can be installed by users
//! to create actual agents in ~/.nolan/agents/

use std::path::Path;
use serde::{Deserialize, Serialize};

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
    pub installed: bool,
}

/// All predefined agent templates embedded in the binary
pub static PREDEFINED_TEMPLATES: &[AgentTemplate] = &[
    AgentTemplate {
        name: "pred-build-nolan",
        agent_yaml: include_str!("../../predefined/agents/pred-build-nolan/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-build-nolan/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-deploy-nolan",
        agent_yaml: include_str!("../../predefined/agents/pred-deploy-nolan/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-deploy-nolan/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-git-commit",
        agent_yaml: include_str!("../../predefined/agents/pred-git-commit/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-git-commit/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-idea-analyzer",
        agent_yaml: include_str!("../../predefined/agents/pred-idea-analyzer/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-idea-analyzer/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-merge-changes",
        agent_yaml: include_str!("../../predefined/agents/pred-merge-changes/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-merge-changes/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-qa-validation",
        agent_yaml: include_str!("../../predefined/agents/pred-qa-validation/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-qa-validation/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-quick-fix",
        agent_yaml: include_str!("../../predefined/agents/pred-quick-fix/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-quick-fix/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-research",
        agent_yaml: include_str!("../../predefined/agents/pred-research/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-research/CLAUDE.md"),
    },
    AgentTemplate {
        name: "pred-security-scan",
        agent_yaml: include_str!("../../predefined/agents/pred-security-scan/agent.yaml"),
        claude_md: include_str!("../../predefined/agents/pred-security-scan/CLAUDE.md"),
    },
];

/// Helper to parse description and model from agent.yaml
fn parse_agent_yaml(yaml: &str) -> (String, String, Option<String>) {
    #[derive(Deserialize)]
    struct AgentYaml {
        description: Option<String>,
        model: Option<String>,
        invocation: Option<Invocation>,
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
        ),
        Err(_) => (String::new(), "sonnet".to_string(), None),
    }
}

/// List all available templates with their install status
pub fn list_templates(agents_dir: &Path) -> Vec<TemplateInfo> {
    PREDEFINED_TEMPLATES
        .iter()
        .map(|t| {
            let (description, model, command) = parse_agent_yaml(t.agent_yaml);
            let installed = agents_dir.join(t.name).exists();
            TemplateInfo {
                name: t.name.to_string(),
                description,
                model,
                command,
                installed,
            }
        })
        .collect()
}

/// Install a template to the agents directory
/// Returns error if already installed (use uninstall first)
pub fn install_template(name: &str, agents_dir: &Path) -> Result<(), String> {
    let template = PREDEFINED_TEMPLATES
        .iter()
        .find(|t| t.name == name)
        .ok_or_else(|| format!("Template '{}' not found", name))?;

    let agent_dir = agents_dir.join(name);

    if agent_dir.exists() {
        return Err(format!("Agent '{}' already installed. Uninstall first to reinstall.", name));
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
pub fn uninstall_template(name: &str, agents_dir: &Path) -> Result<(), String> {
    let agent_dir = agents_dir.join(name);

    if !agent_dir.exists() {
        return Err(format!("Agent '{}' is not installed", name));
    }

    std::fs::remove_dir_all(&agent_dir)
        .map_err(|e| format!("Failed to remove agent directory: {}", e))?;

    Ok(())
}
