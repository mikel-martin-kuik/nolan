//! OpenCode CLI provider implementation

use super::types::*;
use std::process::Command;

/// OpenCode CLI provider
///
/// OpenCode is an open-source AI coding assistant with multi-provider support.
/// Uses the `opencode` CLI command (typically at ~/.opencode/bin/opencode) with flags:
/// - `run <message>`: Run with a message/prompt
/// - `-m <provider/model>`: Model selection (e.g., "anthropic/claude-4-opus")
/// - `-s <session>`: Session ID for resume
/// - `-c, --continue`: Continue last session
/// - `--prompt <prompt>`: Alternative prompt specification
///
/// Note: OpenCode has different flag conventions than Claude Code.
/// Model names must be in provider/model format (e.g., "anthropic/claude-4-opus").
pub struct OpenCodeProvider {
    executable_path: String,
}

impl OpenCodeProvider {
    pub fn new() -> Self {
        Self {
            executable_path: Self::get_executable_path(),
        }
    }

    /// Get the OpenCode executable path
    fn get_executable_path() -> String {
        std::env::var("HOME")
            .map(|home| format!("{}/.opencode/bin/opencode", home))
            .unwrap_or_else(|_| "opencode".to_string())
    }
}

impl CliProvider for OpenCodeProvider {
    fn name(&self) -> &'static str {
        "opencode"
    }

    fn is_available() -> bool {
        let path = Self::get_executable_path();

        // Check if executable exists at expected path
        if std::path::Path::new(&path).exists() {
            return true;
        }

        // Fall back to which command
        Command::new("which")
            .arg("opencode")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn executable(&self) -> &str {
        &self.executable_path
    }

    fn map_model(&self, model: &str) -> String {
        // OpenCode uses provider/model format
        // Map Claude model names to anthropic/claude format
        match model.to_lowercase().as_str() {
            "opus" | "claude-opus" | "claude-4-opus" => "anthropic/claude-4-opus".to_string(),
            "sonnet" | "claude-sonnet" | "claude-4-sonnet" => "anthropic/claude-4-sonnet".to_string(),
            "haiku" | "claude-haiku" | "claude-4-haiku" => "anthropic/claude-4-haiku".to_string(),
            // If already in provider/model format, pass through
            other if other.contains('/') => other.to_string(),
            // Default to anthropic provider for unknown models
            other => format!("anthropic/{}", other),
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

        // Build opencode command
        // OpenCode uses "run" subcommand with message as positional arg
        let prompt_escaped = config.prompt.replace("'", "'\\''");
        let mut cmd = format!("{} run '{}'", self.executable_path, prompt_escaped);

        // Model (provider/model format)
        cmd.push_str(&format!(" -m {}", self.map_model(&config.model)));

        // Session ID for resume capability
        if let Some(ref session_id) = config.session_id {
            cmd.push_str(&format!(" {} {}", self.session_id_flag(), session_id));
        }

        // Resume flag
        if config.resume {
            cmd.push_str(&format!(" {}", self.resume_flag()));
        }

        // Note: OpenCode doesn't have direct equivalents for:
        // - --dangerously-skip-permissions (OpenCode handles differently)
        // - --allowedTools (guardrails handled via config)
        // - --append-system-prompt (uses different mechanism)
        // - --verbose (always outputs to stdout)

        parts.push(cmd);
        parts.join("; ")
    }

    fn build_args(&self, config: &CliSpawnConfig) -> Vec<String> {
        let mut args = Vec::new();

        // OpenCode uses "run" subcommand
        args.push("run".to_string());
        args.push(config.prompt.clone());

        // Model
        args.push("-m".to_string());
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

        args
    }

    fn parse_output(&self, log_path: &str) -> CliResult {
        let mut result = CliResult::default();

        let content = match std::fs::read_to_string(log_path) {
            Ok(c) => c,
            Err(_) => return result,
        };

        // OpenCode output format is different from Claude Code
        // Try to parse JSON output for cost/session info
        // This is a placeholder - actual format depends on OpenCode's output structure
        for line in content.lines().rev() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                // Look for cost information
                if let Some(cost) = value.get("cost").and_then(|c| c.as_f64()) {
                    result.total_cost_usd = Some(cost as f32);
                }
                if let Some(session) = value.get("session_id").and_then(|s| s.as_str()) {
                    result.session_id = Some(session.to_string());
                }
                // Break once we find relevant data
                if result.total_cost_usd.is_some() || result.session_id.is_some() {
                    break;
                }
            }
        }

        result
    }

    fn output_format_flag(&self, _format: &OutputFormat) -> Vec<String> {
        // OpenCode doesn't have the same output format flags as Claude Code
        // It outputs to stdout by default
        Vec::new()
    }

    fn supports_resume(&self) -> bool {
        true
    }

    fn resume_flag(&self) -> &str {
        "--continue"
    }

    fn session_id_flag(&self) -> &str {
        "-s"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_mapping() {
        let provider = OpenCodeProvider::new();
        assert_eq!(provider.map_model("opus"), "anthropic/claude-4-opus");
        assert_eq!(provider.map_model("sonnet"), "anthropic/claude-4-sonnet");
        assert_eq!(provider.map_model("haiku"), "anthropic/claude-4-haiku");
        assert_eq!(provider.map_model("openai/gpt-4"), "openai/gpt-4");
    }

    #[test]
    fn test_build_args() {
        let provider = OpenCodeProvider::new();
        let config = CliSpawnConfig {
            prompt: "Test prompt".to_string(),
            model: "sonnet".to_string(),
            ..Default::default()
        };

        let args = provider.build_args(&config);
        assert!(args.contains(&"run".to_string()));
        assert!(args.contains(&"Test prompt".to_string()));
        assert!(args.contains(&"-m".to_string()));
        assert!(args.contains(&"anthropic/claude-4-sonnet".to_string()));
    }
}
