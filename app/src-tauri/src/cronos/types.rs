use serde::{Deserialize, Serialize};

/// Cron agent configuration (stored in cronos/agents/{name}/agent.yaml)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronAgentConfig {
    pub name: String,
    pub description: String,
    pub model: String,  // sonnet, haiku, opus
    pub timeout: u32,   // seconds
    pub enabled: bool,
    pub schedule: CronSchedule,
    pub guardrails: CronGuardrails,
    pub context: CronContext,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronSchedule {
    pub cron: String,           // Cron expression: "0 0 9 * * 1" (with seconds)
    pub timezone: Option<String>, // Default: system timezone
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronGuardrails {
    pub allowed_tools: Vec<String>,       // ["Read", "Edit", "Glob"]
    pub forbidden_paths: Option<Vec<String>>, // ["**/.env", "**/secrets/**"]
    pub max_file_edits: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronContext {
    pub working_directory: Option<String>,  // Where to run from
}

/// Run log entry (stored in cronos/runs/{date}/{name}-{timestamp}.json)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronRunLog {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: String,     // ISO 8601
    pub completed_at: Option<String>,
    pub status: CronRunStatus,
    pub duration_secs: Option<u32>,
    pub exit_code: Option<i32>,
    pub output_file: String,    // Path to full output log
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CronRunStatus {
    Running,
    Success,
    Failed,
    Timeout,
    Cancelled,
}

/// Schedule registry entry (in schedules.yaml)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScheduleEntry {
    pub agent_name: String,
    pub cron: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
}

/// API response types for frontend
#[derive(Clone, Debug, Serialize)]
pub struct CronAgentInfo {
    pub name: String,
    pub description: String,
    pub model: String,
    pub enabled: bool,
    pub schedule: String,     // Human-readable
    pub next_run: Option<String>,
    pub last_run: Option<CronRunLog>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TestRunResult {
    pub success: bool,
    pub output: String,
    pub duration_secs: u32,
}
