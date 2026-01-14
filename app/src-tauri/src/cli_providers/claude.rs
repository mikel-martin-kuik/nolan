//! Claude Code CLI provider implementation

use super::types::*;
use serde::Deserialize;
use std::process::Command;

/// Claude Code CLI provider
///
/// Uses the `claude` CLI command with flags:
/// - `-p <prompt>`: Prompt to send
/// - `--model <model>`: Model selection (opus, sonnet, haiku)
/// - `--dangerously-skip-permissions`: Skip permission prompts
/// - `--verbose`: Enable verbose output
/// - `--output-format stream-json`: JSON streaming output
/// - `--session-id <id>`: Session ID for resume
/// - `--continue`: Resume previous session
/// - `--allowedTools <tools>`: Comma-separated list of allowed tools
/// - `--append-system-prompt <prompt>`: Additional system prompt
pub struct ClaudeCodeProvider;

impl ClaudeCodeProvider {
    pub fn new() -> Self {
        Self
    }
}

impl CliProvider for ClaudeCodeProvider {
    fn name(&self) -> &'static str {
        "claude"
    }

    fn is_available() -> bool {
        Command::new("which")
            .arg("claude")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn executable(&self) -> &str {
        "claude"
    }

    fn map_model(&self, model: &str) -> String {
        // Claude Code uses simple model names directly
        match model.to_lowercase().as_str() {
            "opus" | "claude-opus" | "claude-4-opus" => "opus".to_string(),
            "sonnet" | "claude-sonnet" | "claude-4-sonnet" => "sonnet".to_string(),
            "haiku" | "claude-haiku" | "claude-4-haiku" => "haiku".to_string(),
            other => other.to_string(),
        }
    }

    fn build_command(&self, config: &CliSpawnConfig) -> String {
        let mut parts = Vec::new();

        // Build environment exports
        if !config.env_vars.is_empty() {
            let exports: Vec<String> = config.env_vars.iter()
                .map(|(k, v)| format!("{}='{}'", k, v.replace("'", "'\\''")))
                .collect();
            parts.push(format!("export {}", exports.join(" ")));
        }

        // Change to working directory
        parts.push(format!("cd '{}'", config.working_dir.to_string_lossy()));

        // Build claude command
        let prompt_escaped = config.prompt.replace("'", "'\\''");
        let mut cmd = format!("claude -p '{}'", prompt_escaped);

        if config.skip_permissions {
            cmd.push_str(" --dangerously-skip-permissions");
        }

        if config.verbose {
            cmd.push_str(" --verbose");
        }

        // Output format
        let format_flags = self.output_format_flag(&config.output_format);
        for flag in format_flags {
            cmd.push_str(&format!(" {}", flag));
        }

        // Model
        cmd.push_str(&format!(" --model {}", self.map_model(&config.model)));

        // Session ID for resume capability
        if let Some(ref session_id) = config.session_id {
            cmd.push_str(&format!(" {} '{}'", self.session_id_flag(), session_id));
        }

        // Resume flag
        if config.resume {
            cmd.push_str(&format!(" {}", self.resume_flag()));
        }

        // Allowed tools
        if !config.allowed_tools.is_empty() {
            cmd.push_str(&format!(" --allowedTools '{}'", config.allowed_tools.join(",")));
        }

        // System prompt append (for guardrails)
        if let Some(ref system_prompt) = config.system_prompt_append {
            let escaped = system_prompt.replace("'", "'\\''");
            cmd.push_str(&format!(" --append-system-prompt '{}'", escaped));
        }

        parts.push(cmd);
        parts.join("; ")
    }

    fn build_args(&self, config: &CliSpawnConfig) -> Vec<String> {
        let mut args = Vec::new();

        args.push("-p".to_string());
        args.push(config.prompt.clone());

        if config.skip_permissions {
            args.push("--dangerously-skip-permissions".to_string());
        }

        if config.verbose {
            args.push("--verbose".to_string());
        }

        // Output format
        args.extend(self.output_format_flag(&config.output_format));

        // Model
        args.push("--model".to_string());
        args.push(self.map_model(&config.model));

        // Session ID
        if let Some(ref session_id) = config.session_id {
            args.push(self.session_id_flag().to_string());
            args.push(session_id.clone());
        }

        // Resume
        if config.resume {
            args.push(self.resume_flag().to_string());
        }

        // Allowed tools
        if !config.allowed_tools.is_empty() {
            args.push("--allowedTools".to_string());
            args.push(config.allowed_tools.join(","));
        }

        // System prompt append
        if let Some(ref system_prompt) = config.system_prompt_append {
            args.push("--append-system-prompt".to_string());
            args.push(system_prompt.clone());
        }

        args
    }

    fn parse_output(&self, log_path: &str) -> CliResult {
        let mut result = CliResult::default();

        let content = match std::fs::read_to_string(log_path) {
            Ok(c) => c,
            Err(_) => return result,
        };

        // Parse JSON lines looking for result entry with cost
        #[derive(Deserialize)]
        struct ResultEntry {
            #[serde(rename = "type")]
            entry_type: String,
            total_cost_usd: Option<f32>,
            session_id: Option<String>,
        }

        for line in content.lines().rev() {
            if let Ok(entry) = serde_json::from_str::<ResultEntry>(line) {
                if entry.entry_type == "result" {
                    result.total_cost_usd = entry.total_cost_usd;
                    result.session_id = entry.session_id;
                    break;
                }
            }
        }

        result
    }

    fn output_format_flag(&self, format: &OutputFormat) -> Vec<String> {
        match format {
            OutputFormat::StreamJson => vec!["--output-format".to_string(), "stream-json".to_string()],
            OutputFormat::Json => vec!["--output-format".to_string(), "json".to_string()],
            OutputFormat::Text => vec!["--output-format".to_string(), "text".to_string()],
        }
    }

    fn supports_resume(&self) -> bool {
        true
    }

    fn resume_flag(&self) -> &str {
        "--continue"
    }

    fn session_id_flag(&self) -> &str {
        "--session-id"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_mapping() {
        let provider = ClaudeCodeProvider::new();
        assert_eq!(provider.map_model("opus"), "opus");
        assert_eq!(provider.map_model("sonnet"), "sonnet");
        assert_eq!(provider.map_model("haiku"), "haiku");
        assert_eq!(provider.map_model("claude-4-opus"), "opus");
    }

    #[test]
    fn test_build_args() {
        let provider = ClaudeCodeProvider::new();
        let config = CliSpawnConfig {
            prompt: "Test prompt".to_string(),
            model: "sonnet".to_string(),
            skip_permissions: true,
            verbose: true,
            ..Default::default()
        };

        let args = provider.build_args(&config);
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"Test prompt".to_string()));
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"sonnet".to_string()));
    }
}
