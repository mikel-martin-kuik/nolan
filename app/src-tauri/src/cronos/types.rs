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
    // New fields for enhanced functionality
    #[serde(default)]
    pub concurrency: ConcurrencyPolicy,
    #[serde(default)]
    pub retry: RetryPolicy,
    #[serde(default)]
    pub catch_up: CatchUpPolicy,
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

/// Concurrency control policy
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ConcurrencyPolicy {
    #[serde(default)]
    pub allow_parallel: bool,  // Default: false - don't allow parallel runs
    #[serde(default)]
    pub queue_if_running: bool, // Default: false - skip if already running
}

/// Retry policy for failed runs
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RetryPolicy {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "default_retry_delay")]
    pub delay_secs: u32,
    #[serde(default)]
    pub exponential_backoff: bool,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            max_retries: 3,
            delay_secs: 60,
            exponential_backoff: false,
        }
    }
}

fn default_max_retries() -> u32 { 3 }
fn default_retry_delay() -> u32 { 60 }

/// Catch-up policy for missed runs
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CatchUpPolicy {
    #[default]
    Skip,       // Don't run missed executions
    RunOnce,    // Run once if any were missed
    RunAll,     // Run all missed executions
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
    // New fields for retry tracking
    #[serde(default)]
    pub attempt: u32,           // Current attempt number (1-based)
    #[serde(default)]
    pub trigger: RunTrigger,    // How the run was triggered
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CronRunStatus {
    Running,
    Success,
    Failed,
    Timeout,
    Cancelled,
    Skipped,    // Skipped due to concurrency
    Retrying,   // Will be retried
}

/// How a run was triggered
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RunTrigger {
    #[default]
    Scheduled,      // Triggered by cron schedule
    Manual,         // Triggered by user
    Retry,          // Triggered by retry policy
    CatchUp,        // Triggered by catch-up policy
}

/// Persistent scheduler state (stored in cronos/scheduler_state.json)
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SchedulerState {
    pub agents: std::collections::HashMap<String, AgentState>,
    pub last_updated: Option<String>,
}

/// Per-agent persistent state
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct AgentState {
    pub last_run: Option<String>,           // ISO 8601
    pub last_status: Option<CronRunStatus>,
    pub next_scheduled: Option<String>,     // ISO 8601
    pub consecutive_failures: u32,
    pub total_runs: u32,
    pub total_successes: u32,
    pub total_failures: u32,
}

/// Running process info (in-memory only)
#[derive(Clone, Debug)]
pub struct RunningProcess {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub pid: Option<u32>,
    pub log_file: std::path::PathBuf,
    pub json_file: std::path::PathBuf,
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
    pub cron_expression: String, // Raw cron expression
    pub next_run: Option<String>,
    pub last_run: Option<CronRunLog>,
    // New fields for enhanced monitoring
    pub is_running: bool,
    pub current_run_id: Option<String>,
    pub consecutive_failures: u32,
    pub health: AgentHealth,
    pub stats: AgentStats,
}

/// Agent health status
#[derive(Clone, Debug, Serialize, Default)]
pub struct AgentHealth {
    pub status: HealthStatus,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    #[default]
    Healthy,
    Warning,    // Some recent failures
    Critical,   // Multiple consecutive failures
    Unknown,    // No runs yet
}

/// Agent statistics
#[derive(Clone, Debug, Serialize, Default)]
pub struct AgentStats {
    pub total_runs: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f32,      // 0.0 - 1.0
    pub avg_duration_secs: Option<f32>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TestRunResult {
    pub success: bool,
    pub output: String,
    pub duration_secs: u32,
}

/// Real-time output event for streaming
#[derive(Clone, Debug, Serialize)]
pub struct CronOutputEvent {
    pub run_id: String,
    pub agent_name: String,
    pub event_type: OutputEventType,
    pub content: String,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputEventType {
    Stdout,
    Stderr,
    Status,     // Status change
    Complete,   // Run completed
}

/// Health summary for dashboard
#[derive(Clone, Debug, Serialize, Default)]
pub struct CronosHealthSummary {
    pub total_agents: u32,
    pub active_agents: u32,
    pub running_agents: u32,
    pub healthy_agents: u32,
    pub warning_agents: u32,
    pub critical_agents: u32,
    pub recent_runs: Vec<CronRunLog>,
    pub success_rate_7d: f32,
    pub success_rate_30d: f32,
}
