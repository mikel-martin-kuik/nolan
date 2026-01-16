use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use ts_rs::TS;

/// Agent Identity - what the agent does
/// This enum cleanly separates agent role/capability from triggering mechanisms
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    /// Creates code and implements features
    Implementer,
    /// Evaluates work and provides verdicts
    Analyzer,
    /// Git merge operations
    Merger,
    /// Compiles and packages
    Builder,
    /// Security and code analysis
    Scanner,
    /// Code organization and indexing
    Indexer,
    /// Workflow observation and reporting
    Monitor,
    /// Information gathering and research
    Researcher,
    /// Design and planning
    Planner,
    /// User-spawned flexible agent
    Free,
}

/// Unified trigger configuration - how the agent is invoked
/// Multiple triggers can be active simultaneously
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct TriggerConfig {
    /// Cron schedule trigger
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<AgentSchedule>,

    /// Manual command invocation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<InvocationConfig>,

    /// Event-based triggers (multiple allowed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<EventTrigger>>,

    /// Pipeline stage trigger
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline_stage: Option<PipelineStageConfig>,
}

/// Schedule configuration - decoupled from agent config
/// Stored in ~/.nolan/schedules.yaml
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduleConfig {
    /// Unique identifier (UUID)
    pub id: String,
    /// User-friendly name for the schedule
    pub name: String,
    /// Agent to trigger when schedule fires
    pub agent_name: String,
    /// Cron expression (5-field: minute hour day month weekday)
    pub cron: String,
    /// Whether this schedule is active
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Timezone for the schedule (default: system timezone)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// Next scheduled run time (computed, not persisted)
    #[serde(skip)]
    pub next_run: Option<String>,
}

/// Wrapper for schedules.yaml file
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SchedulesFile {
    #[serde(default)]
    pub schedules: Vec<ScheduleConfig>,
}

/// Configuration for pipeline stage triggers
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineStageConfig {
    /// The pipeline this agent belongs to
    pub pipeline: String,
    /// Stage type in the pipeline
    pub stage_type: PipelineStageType,
    /// Order within stage (for multiple agents in same stage)
    #[serde(default)]
    pub order: u32,
}

/// Event trigger configuration (for Event type agents)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct EventTrigger {
    pub event_type: EventType,
    pub pattern: Option<String>, // Optional regex/glob pattern
    #[serde(default = "default_debounce")]
    pub debounce_ms: u32, // Debounce to avoid rapid re-triggers
}

fn default_debounce() -> u32 {
    1000
}

/// Supported event types
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    IdeaApproved,
    IdeaReceived,
    TeamWorkflowStarted,
    TeamWorkflowFinished,
    UserLoggedIn,
    GitPush,
    FileChanged,
    StateChange,
}

/// Invocation configuration (for Predefined type agents)
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct InvocationConfig {
    pub command: Option<String>, // Slash command: /security-scan
    pub button_label: String,    // UI button text
    pub icon: Option<String>,    // Icon name (lucide icon)
}

/// Agent configuration (stored in agents/{name}/agent.yaml)
/// Now supports multiple agent types: Cron, Predefined, and Event
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduledAgentConfig {
    pub name: String,
    pub description: String,
    pub model: String, // sonnet, haiku, opus
    pub timeout: u32,  // seconds
    pub enabled: bool,
    /// Agent role - what this agent does (optional for backwards compat)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<AgentRole>,
    /// Unified trigger config (optional for backwards compat)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub triggers: Option<TriggerConfig>,
    #[serde(default)]
    pub schedule: Option<AgentSchedule>, // Only required for Cron type
    pub guardrails: ScheduleGuardrails,
    pub context: ScheduleContext,
    // Group assignment (references groups.yaml)
    #[serde(default)]
    pub group: Option<String>,
    // New fields for enhanced functionality
    #[serde(default)]
    pub concurrency: ConcurrencyPolicy,
    #[serde(default)]
    pub retry: RetryPolicy,
    #[serde(default)]
    pub catch_up: CatchUpPolicy,
    #[serde(default)]
    pub event_trigger: Option<EventTrigger>, // For Event type
    #[serde(default)]
    pub invocation: Option<InvocationConfig>, // For Predefined type
    // Git worktree isolation for demanding feature tasks
    #[serde(default)]
    pub worktree: Option<WorktreeConfig>,
    // Post-run analyzer configuration
    // If set, this agent will be triggered after completion to analyze results
    #[serde(default)]
    pub post_run_analyzer: Option<PostRunAnalyzerConfig>,
    /// CLI provider to use for this agent (default: claude)
    /// Options: "claude" (Claude Code), "opencode" (OpenCode)
    #[serde(default)]
    pub cli_provider: Option<String>,
}

/// Unified agent configuration (alias during transition from ScheduledAgentConfig)
/// Use this type for new code; ScheduledAgentConfig will be deprecated in future versions
pub type AgentConfig = ScheduledAgentConfig;

impl ScheduledAgentConfig {
    /// Get the effective role, inferring from name if not specified
    pub fn effective_role(&self) -> AgentRole {
        if let Some(role) = &self.role {
            return role.clone();
        }

        // Infer from agent name patterns
        // Use suffix-based matching: the LAST role keyword determines the role
        // e.g., "implementer-analyzer" -> Analyzer (analyzes implementer output)
        let name = self.name.to_lowercase();

        // Build a list of (position, role) for all matching patterns
        let mut matches: Vec<(usize, AgentRole)> = Vec::new();

        if let Some(pos) = name.find("implement") {
            matches.push((pos, AgentRole::Implementer));
        }
        if let Some(pos) = name.find("analyz") {
            matches.push((pos, AgentRole::Analyzer));
        }
        if let Some(pos) = name.find("merge") {
            matches.push((pos, AgentRole::Merger));
        }
        if let Some(pos) = name.find("build") {
            matches.push((pos, AgentRole::Builder));
        }
        if let Some(pos) = name.find("scan") {
            matches.push((pos, AgentRole::Scanner));
        }
        if let Some(pos) = name.find("security") {
            matches.push((pos, AgentRole::Scanner));
        }
        if let Some(pos) = name.find("audit") {
            matches.push((pos, AgentRole::Scanner));
        }
        if let Some(pos) = name.find("index") {
            matches.push((pos, AgentRole::Indexer));
        }
        if let Some(pos) = name.find("monitor") {
            matches.push((pos, AgentRole::Monitor));
        }
        if let Some(pos) = name.find("research") {
            matches.push((pos, AgentRole::Researcher));
        }
        if let Some(pos) = name.find("plan") {
            if !name.contains("explain") {
                matches.push((pos, AgentRole::Planner));
            }
        }

        // Return the role with the highest position (last match wins)
        if let Some((_, role)) = matches.into_iter().max_by_key(|(pos, _)| *pos) {
            role
        } else {
            AgentRole::Free
        }
    }

    /// Get the effective trigger config, building from legacy fields if not specified
    pub fn effective_triggers(&self) -> TriggerConfig {
        if let Some(triggers) = &self.triggers {
            return triggers.clone();
        }

        // Build from legacy fields
        TriggerConfig {
            schedule: self.schedule.clone(),
            command: self.invocation.clone(),
            events: self.event_trigger.as_ref().map(|e| vec![e.clone()]),
            pipeline_stage: None,
        }
    }

    /// Check if this agent has a cron schedule (time-triggered)
    pub fn has_schedule(&self) -> bool {
        self.effective_triggers().schedule.is_some()
    }

    /// Check if this agent has manual invocation (predefined/command-triggered)
    pub fn has_invocation(&self) -> bool {
        self.effective_triggers().command.is_some()
    }

    /// Check if this agent has event triggers
    pub fn has_event_triggers(&self) -> bool {
        self.effective_triggers()
            .events
            .map(|e| !e.is_empty())
            .unwrap_or(false)
    }

    /// Get the agent type classification based on configuration
    /// Used for determining storage directory and behavior
    pub fn agent_type(&self) -> &'static str {
        if self.has_schedule() {
            "scheduled"
        } else if self.has_invocation() {
            "predefined"
        } else if self.has_event_triggers() {
            "event"
        } else {
            "generic"
        }
    }
}

/// Configuration for automatic post-run analysis
/// The analyzer agent receives context about the completed run and can decide
/// whether to trigger a relaunch with follow-up instructions
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PostRunAnalyzerConfig {
    /// Name of the analyzer agent to trigger after this agent completes
    pub analyzer_agent: String,
    /// Trigger analyzer on success (default: true)
    #[serde(default = "default_true")]
    pub on_success: bool,
    /// Trigger analyzer on failure (default: true)
    #[serde(default = "default_true")]
    pub on_failure: bool,
    /// Trigger analyzer on timeout (default: true)
    #[serde(default = "default_true")]
    pub on_timeout: bool,
}

fn default_true() -> bool {
    true
}

/// Configuration for git worktree isolation
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct WorktreeConfig {
    /// Enable worktree isolation for this agent
    #[serde(default)]
    pub enabled: bool,
    /// Repository path to create worktree from (defaults to NOLAN_ROOT)
    pub repo_path: Option<String>,
    /// Base branch to create worktree from (defaults to current branch)
    pub base_branch: Option<String>,
}

/// Scheduled agent group definition (stored in scheduler/groups.yaml)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduledAgentGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub order: i32,
}

/// Groups configuration file structure
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct GroupsConfig {
    #[serde(default)]
    pub groups: Vec<ScheduledAgentGroup>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AgentSchedule {
    pub cron: String,             // Cron expression: "0 0 9 * * 1" (with seconds)
    pub timezone: Option<String>, // Default: system timezone
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduleGuardrails {
    pub allowed_tools: Vec<String>,           // ["Read", "Edit", "Glob"]
    pub forbidden_paths: Option<Vec<String>>, // ["**/.env", "**/secrets/**"]
    pub max_file_edits: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduleContext {
    pub working_directory: Option<String>, // Where to run from
}

/// Concurrency control policy
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ConcurrencyPolicy {
    #[serde(default)]
    pub allow_parallel: bool, // Default: false - don't allow parallel runs
    #[serde(default)]
    pub queue_if_running: bool, // Default: false - skip if already running
}

/// Retry policy for failed runs
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
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

fn default_max_retries() -> u32 {
    3
}
fn default_retry_delay() -> u32 {
    60
}

/// Catch-up policy for missed runs
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum CatchUpPolicy {
    #[default]
    Skip, // Don't run missed executions
    RunOnce, // Run once if any were missed
    RunAll,  // Run all missed executions
}

/// Run log entry (stored in data/runs/{date}/{name}-{timestamp}.json)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduledRunLog {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: String, // ISO 8601
    pub completed_at: Option<String>,
    pub status: ScheduledRunStatus,
    pub duration_secs: Option<u32>,
    pub exit_code: Option<i32>,
    pub output_file: String, // Path to full output log
    pub error: Option<String>,
    // New fields for retry tracking
    #[serde(default)]
    pub attempt: u32, // Current attempt number (1-based)
    #[serde(default)]
    pub trigger: RunTrigger, // How the run was triggered
    // New fields for tmux-based persistence
    #[serde(default)]
    pub session_name: Option<String>, // tmux session name for recovery
    #[serde(default)]
    pub run_dir: Option<String>, // ephemeral working directory
    // Claude session ID for --resume capability (distinct from tmux session_name)
    #[serde(default)]
    pub claude_session_id: Option<String>,
    // Cost tracking (extracted from Claude output)
    #[serde(default)]
    pub total_cost_usd: Option<f32>,
    // Git worktree isolation fields
    #[serde(default)]
    pub worktree_path: Option<String>, // Path to the worktree if used
    #[serde(default)]
    pub worktree_branch: Option<String>, // Branch name for the worktree
    #[serde(default)]
    pub base_commit: Option<String>, // Commit at worktree creation
    // Human-readable label describing what this run is working on (e.g., "implement-user-auth")
    #[serde(default)]
    pub label: Option<String>,
    // Analyzer verdict (populated after analyzer agent runs)
    #[serde(default)]
    pub analyzer_verdict: Option<AnalyzerVerdict>,
    // Pipeline ID this run belongs to (if part of a pipeline)
    #[serde(default)]
    pub pipeline_id: Option<String>,
    // Parent run ID (for analyzer runs, this points to the implementer run being analyzed)
    #[serde(default)]
    pub parent_run_id: Option<String>,
}

/// Verdict from a post-run analyzer agent
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AnalyzerVerdict {
    /// The verdict: COMPLETE, FOLLOWUP, or FAILED
    pub verdict: AnalyzerVerdictType,
    /// Brief explanation of the verdict
    pub reason: String,
    /// If FOLLOWUP, the prompt to use for session relaunch
    pub follow_up_prompt: Option<String>,
    /// List of specific findings from analysis
    pub findings: Vec<String>,
    /// Run ID of the analyzer that produced this verdict
    #[serde(default)]
    pub analyzer_run_id: Option<String>,
}

/// Type of analyzer verdict
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "UPPERCASE")]
pub enum AnalyzerVerdictType {
    Complete,
    Followup,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "lowercase")]
pub enum ScheduledRunStatus {
    Running,
    Success,
    Failed,
    Timeout,
    Cancelled,
    Skipped,     // Skipped due to concurrency
    Retrying,    // Will be retried
    Interrupted, // Job was interrupted by app restart (process died)
}

/// How a run was triggered
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum RunTrigger {
    #[default]
    Scheduled, // Triggered by cron schedule
    Manual,  // Triggered by user
    Retry,   // Triggered by retry policy
    CatchUp, // Triggered by catch-up policy
}

/// Persistent scheduler state (stored in .state/scheduler/state.json)
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct SchedulerState {
    pub agents: std::collections::HashMap<String, AgentState>,
    pub last_updated: Option<String>,
}

/// Per-agent persistent state
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AgentState {
    pub last_run: Option<String>, // ISO 8601
    pub last_status: Option<ScheduledRunStatus>,
    pub next_scheduled: Option<String>, // ISO 8601
    pub consecutive_failures: u32,
    pub total_runs: u32,
    pub total_successes: u32,
    pub total_failures: u32,
}

/// Cancellation token for stopping running processes
pub type CancellationToken = Arc<RwLock<bool>>;

/// Running process info (in-memory tracking, recoverable via tmux session)
#[derive(Clone, Debug)]
pub struct RunningProcess {
    pub run_id: String,
    pub agent_name: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub pid: Option<u32>,
    pub log_file: std::path::PathBuf,
    pub json_file: std::path::PathBuf,
    pub session_name: Option<String>, // tmux session name for recovery
    pub run_dir: Option<std::path::PathBuf>, // ephemeral working directory
    pub cancellation_token: Option<CancellationToken>, // For stopping the process
    pub claude_session_id: Option<String>, // Claude --session-id for relaunch
    // Git worktree isolation fields
    pub worktree_path: Option<std::path::PathBuf>, // Path to the worktree if enabled
    pub worktree_branch: Option<String>,           // Branch name for the worktree
    pub base_commit: Option<String>,               // Commit at worktree creation
}

/// Orphaned cron session detected on startup (for recovery)
#[derive(Clone, Debug)]
pub struct OrphanedScheduledSession {
    pub run_log: ScheduledRunLog,
    pub json_file: std::path::PathBuf,
    pub session_alive: bool, // true if tmux session still exists
}

/// Result of cron session recovery
#[derive(Clone, Debug, Default)]
pub struct ScheduledRecoveryResult {
    pub recovered: Vec<String>, // Successfully reattached to running sessions
    pub interrupted: Vec<String>, // Marked as interrupted (process died)
    pub errors: Vec<String>,    // Errors during recovery
}

impl ScheduledRecoveryResult {
    pub fn is_empty(&self) -> bool {
        self.recovered.is_empty() && self.interrupted.is_empty() && self.errors.is_empty()
    }

    pub fn summary(&self) -> String {
        let mut parts = Vec::new();
        if !self.recovered.is_empty() {
            parts.push(format!("{} recovered", self.recovered.len()));
        }
        if !self.interrupted.is_empty() {
            parts.push(format!("{} interrupted", self.interrupted.len()));
        }
        if !self.errors.is_empty() {
            parts.push(format!("{} errors", self.errors.len()));
        }
        if parts.is_empty() {
            "no orphaned cron sessions".to_string()
        } else {
            parts.join(", ")
        }
    }
}

/// Schedule registry entry (in schedules.yaml)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduleEntry {
    pub agent_name: String,
    pub cron: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
}

/// API response types for frontend
#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduledAgentInfo {
    pub name: String,
    pub description: String,
    pub model: String,
    pub enabled: bool,
    pub role: AgentRole, // Agent role - what this agent does (implementer/analyzer/etc.)
    pub schedule: String,      // Human-readable (empty for non-cron)
    pub cron_expression: String, // Raw cron expression (empty for non-cron)
    pub next_run: Option<String>,
    pub last_run: Option<ScheduledRunLog>,
    // Group assignment
    pub group: Option<String>,
    // New fields for enhanced monitoring
    pub is_running: bool,
    pub current_run_id: Option<String>,
    pub consecutive_failures: u32,
    pub health: AgentHealth,
    pub stats: AgentStats,
    // New fields for predefined/event agents
    pub event_trigger: Option<EventTrigger>,
    pub invocation: Option<InvocationConfig>,
}

/// Agent health status
#[derive(Clone, Debug, Serialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AgentHealth {
    pub status: HealthStatus,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Default, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    #[default]
    Healthy,
    Warning,  // Some recent failures
    Critical, // Multiple consecutive failures
    Unknown,  // No runs yet
}

/// Agent statistics
#[derive(Clone, Debug, Serialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct AgentStats {
    pub total_runs: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f32, // 0.0 - 1.0
    pub avg_duration_secs: Option<f32>,
    pub total_cost_usd: Option<f32>,
    pub avg_cost_usd: Option<f32>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct TestRunResult {
    pub success: bool,
    pub output: String,
    pub duration_secs: u32,
}

/// Real-time output event for streaming
#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct ScheduledOutputEvent {
    pub run_id: String,
    pub agent_name: String,
    pub event_type: OutputEventType,
    pub content: String,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum OutputEventType {
    Stdout,
    Stderr,
    Status,   // Status change
    Complete, // Run completed
}

/// Health summary for dashboard
#[derive(Clone, Debug, Serialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct SchedulerHealthSummary {
    pub total_agents: u32,
    pub active_agents: u32,
    pub running_agents: u32,
    pub healthy_agents: u32,
    pub warning_agents: u32,
    pub critical_agents: u32,
    pub recent_runs: Vec<ScheduledRunLog>,
    pub success_rate_7d: f32,
    pub success_rate_30d: f32,
    pub total_cost_7d: f32,
}

// ============================================================================
// Pipeline Types - CI/CD-like tracking for agent orchestration
// ============================================================================

/// Overall pipeline status
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatus {
    Created,    // Pipeline created, waiting to start
    InProgress, // At least one stage running or pending
    Completed,  // All stages completed successfully (merged)
    Failed,     // A stage failed and pipeline cannot continue
    Blocked,    // QA failed, waiting for retry or skip
    Aborted,    // Manually cancelled
}

impl Default for PipelineStatus {
    fn default() -> Self {
        PipelineStatus::Created
    }
}

/// Stage status within a pipeline
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum PipelineStageStatus {
    Pending, // Not yet started
    Running, // Currently executing
    Success, // Completed successfully
    Failed,  // Completed with failure
    Skipped, // Manually skipped
    Blocked, // Waiting on manual intervention
}

impl Default for PipelineStageStatus {
    fn default() -> Self {
        PipelineStageStatus::Pending
    }
}

/// Type of pipeline stage
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum PipelineStageType {
    Implementer,
    Analyzer,
    Merger,
}

/// A stage within a pipeline
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineStage {
    pub stage_type: PipelineStageType,
    pub status: PipelineStageStatus,
    pub agent_name: String,
    pub run_id: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub verdict: Option<AnalyzerVerdict>,
    pub skip_reason: Option<String>,
    #[serde(default)]
    pub attempt: u32,
}

/// Pipeline event types for audit trail
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum PipelineEventType {
    PipelineCreated,
    StageStarted,
    StageCompleted,
    StageFailed,
    StageSkipped,
    VerdictReceived,
    PipelineCompleted,
    PipelineFailed,
    PipelineAborted,
    PipelineManuallyCompleted,
    RetryTriggered,
}

/// An event in the pipeline audit log
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineEvent {
    pub timestamp: String,
    pub event_type: PipelineEventType,
    pub stage_type: Option<PipelineStageType>,
    pub run_id: Option<String>,
    pub message: String,
    #[ts(type = "Record<string, unknown> | null")]
    pub metadata: Option<serde_json::Value>,
}

/// Captured inputs for reproducibility
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineInputs {
    pub idea_id: Option<String>,
    pub idea_title: Option<String>,
    pub env_vars: std::collections::HashMap<String, String>,
    pub git_commit: Option<String>,
    pub timestamp: String,
}

/// Full pipeline state (persisted to .state/pipelines/{id}.json)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct Pipeline {
    pub id: String,
    pub status: PipelineStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,

    // Correlation
    pub idea_id: String,
    pub idea_title: String,

    // Git worktree
    pub worktree_path: Option<String>,
    pub worktree_branch: Option<String>,
    pub base_commit: Option<String>,

    // Stages
    pub stages: Vec<PipelineStage>,
    pub current_stage: PipelineStageType,

    // Audit trail
    pub events: Vec<PipelineEvent>,

    // Reproducibility
    pub inputs: PipelineInputs,

    // Cost tracking
    pub total_cost_usd: Option<f32>,
}

/// Next action for pipeline state machine
#[derive(Clone, Debug)]
pub enum PipelineNextAction {
    TriggerAnalyzer {
        run_id: String,
    },
    TriggerMerger {
        worktree_path: String,
        worktree_branch: String,
    },
    RelaunchSession {
        run_id: String,
        prompt: String,
    },
    Complete,
    Fail {
        reason: String,
    },
}

// =============================================================================
// Pipeline Definition (YAML schema) - Declarative pipeline configuration
// =============================================================================

/// Pipeline definition loaded from YAML - defines the pipeline structure
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineDefinition {
    pub name: String,
    pub description: Option<String>,
    #[serde(default = "default_version")]
    pub version: String,
    pub stages: Vec<PipelineStageDefinition>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

/// Stage definition in a pipeline YAML
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineStageDefinition {
    /// Stage identifier (implementer, analyzer, qa, merger)
    pub name: String,
    /// Agent to run for this stage
    pub agent: String,
    /// Human-readable description
    pub description: Option<String>,
    /// Transitions based on outcome
    #[serde(default)]
    pub transitions: PipelineTransitions,
    /// Whether this stage can be skipped
    #[serde(default)]
    pub skippable: bool,
    /// Whether this stage can be retried
    #[serde(default = "default_stage_retryable")]
    pub retryable: bool,
    /// Maximum retry attempts
    #[serde(default = "default_stage_max_retries")]
    pub max_retries: u32,
}

fn default_stage_retryable() -> bool {
    true
}

fn default_stage_max_retries() -> u32 {
    3
}

/// Transition rules for a pipeline stage
#[derive(Clone, Debug, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PipelineTransitions {
    /// Next stage on success (exit code 0)
    pub on_success: Option<String>,
    /// Next stage on failure
    pub on_failure: Option<String>,
    /// For analyzer: next stage when verdict is COMPLETE
    pub on_complete: Option<String>,
    /// For analyzer: next stage when verdict is FOLLOWUP (re-run implementer)
    pub on_followup: Option<String>,
    /// For analyzer: action when verdict is FAILED
    pub on_failed: Option<String>,
}

// ============================================================================
// Team Pipeline Types - Pipeline tracking for team agent workflows
// ============================================================================

/// Type of team pipeline stage - derived from team.yaml phases
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum TeamPipelineStageType {
    PhaseExecution,  // Agent working on phase output
    PhaseValidation, // Validator checking output quality
}

/// Verdict from a phase validator agent
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct PhaseVerdict {
    /// The verdict: COMPLETE, REVISION, or FAILED
    pub verdict: PhaseVerdictType,
    /// Brief explanation of the verdict
    pub reason: String,
    /// If REVISION, the prompt to use for session relaunch
    pub revision_prompt: Option<String>,
    /// List of specific findings from validation
    pub findings: Vec<String>,
    /// Run ID of the validator that produced this verdict
    #[serde(default)]
    pub validator_run_id: Option<String>,
}

/// Type of phase verdict
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "UPPERCASE")]
pub enum PhaseVerdictType {
    Complete, // Phase output meets requirements, proceed to next phase
    Revision, // Phase output needs work, retry with feedback
    Failed,   // Phase cannot be completed, escalate to human
}

/// A stage within a team pipeline
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct TeamPipelineStage {
    /// Phase name from team.yaml
    pub phase_name: String,
    /// Current stage type (execution or validation)
    pub stage_type: TeamPipelineStageType,
    /// Stage status (reuse PipelineStageStatus)
    pub status: PipelineStageStatus,
    /// Agent responsible for this stage
    pub agent_name: String,
    /// Run ID if stage has started
    pub run_id: Option<String>,
    /// When stage started
    pub started_at: Option<String>,
    /// When stage completed
    pub completed_at: Option<String>,
    /// Validator verdict (for validation stages)
    pub verdict: Option<PhaseVerdict>,
    /// Skip reason if stage was skipped
    pub skip_reason: Option<String>,
    /// Attempt number (1-based)
    #[serde(default)]
    pub attempt: u32,
    /// Output file path
    pub output_file: Option<String>,
}

/// Full team pipeline state (persisted to .state/team-pipelines/{id}.json)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
pub struct TeamPipeline {
    pub id: String,
    pub status: PipelineStatus, // Reuse existing enum
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,

    // Correlation
    pub team_name: String,
    pub project_name: String,
    pub docs_path: String,

    // Stages - dynamically built from team.yaml phases
    pub stages: Vec<TeamPipelineStage>,
    pub current_phase: String, // Current phase name
    pub current_stage_type: TeamPipelineStageType,

    // Audit trail
    pub events: Vec<PipelineEvent>, // Reuse existing event type

    // Cost tracking
    pub total_cost_usd: Option<f32>,
}

/// Next action for team pipeline state machine
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/scheduler/")]
#[serde(rename_all = "snake_case")]
pub enum TeamPipelineNextAction {
    TriggerValidator {
        phase_name: String,
        output_file: String,
    },
    TriggerNextPhase {
        phase_name: String,
        agent_name: String,
    },
    RetryPhase {
        phase_name: String,
        agent_name: String,
        prompt: String,
    },
    EscalateToHuman {
        phase_name: String,
        reason: String,
    },
    Complete,
    Fail {
        reason: String,
    },
}

#[cfg(test)]
mod agent_role_tests {
    use super::*;

    fn make_test_config(name: &str, role: Option<AgentRole>) -> ScheduledAgentConfig {
        ScheduledAgentConfig {
            name: name.to_string(),
            description: "Test agent".to_string(),
            model: "sonnet".to_string(),
            timeout: 300,
            enabled: true,
            role,
            triggers: None,
            schedule: None,
            guardrails: ScheduleGuardrails {
                allowed_tools: vec!["Read".to_string()],
                forbidden_paths: None,
                max_file_edits: None,
            },
            context: ScheduleContext {
                working_directory: None,
            },
            group: None,
            concurrency: ConcurrencyPolicy::default(),
            retry: RetryPolicy::default(),
            catch_up: CatchUpPolicy::default(),
            event_trigger: None,
            invocation: None,
            worktree: None,
            post_run_analyzer: None,
            cli_provider: None,
        }
    }

    #[test]
    fn test_role_inference_implementer() {
        let config = make_test_config("idea-implementer", None);
        assert_eq!(config.effective_role(), AgentRole::Implementer);
    }

    #[test]
    fn test_role_inference_analyzer() {
        let config = make_test_config("implementer-analyzer", None);
        assert_eq!(config.effective_role(), AgentRole::Analyzer);
    }

    #[test]
    fn test_role_inference_merger() {
        let config = make_test_config("merge-changes", None);
        assert_eq!(config.effective_role(), AgentRole::Merger);
    }

    #[test]
    fn test_role_inference_builder() {
        let config = make_test_config("build-nolan", None);
        assert_eq!(config.effective_role(), AgentRole::Builder);
    }

    #[test]
    fn test_role_inference_scanner() {
        let config = make_test_config("security-audit", None);
        assert_eq!(config.effective_role(), AgentRole::Scanner);
    }

    #[test]
    fn test_role_inference_indexer() {
        let config = make_test_config("code-indexer", None);
        assert_eq!(config.effective_role(), AgentRole::Indexer);
    }

    #[test]
    fn test_role_inference_monitor() {
        let config = make_test_config("workflow-monitor", None);
        assert_eq!(config.effective_role(), AgentRole::Monitor);
    }

    #[test]
    fn test_role_inference_researcher() {
        let config = make_test_config("research", None);
        assert_eq!(config.effective_role(), AgentRole::Researcher);
    }

    #[test]
    fn test_role_inference_planner() {
        let config = make_test_config("planning-agent", None);
        assert_eq!(config.effective_role(), AgentRole::Planner);
    }

    #[test]
    fn test_role_inference_free() {
        let config = make_test_config("ralph", None);
        assert_eq!(config.effective_role(), AgentRole::Free);
    }

    #[test]
    fn test_explicit_role_overrides_inference() {
        let config = make_test_config("idea-implementer", Some(AgentRole::Analyzer));
        assert_eq!(config.effective_role(), AgentRole::Analyzer);
    }

    #[test]
    fn test_trigger_config_from_legacy_schedule() {
        let mut config = make_test_config("test", None);
        config.schedule = Some(AgentSchedule {
            cron: "0 0 * * *".to_string(),
            timezone: None,
        });

        let triggers = config.effective_triggers();
        assert!(triggers.schedule.is_some());
        assert!(triggers.command.is_none());
        assert!(triggers.events.is_none());
    }

    #[test]
    fn test_trigger_config_from_legacy_invocation() {
        let mut config = make_test_config("test", None);
        config.invocation = Some(InvocationConfig {
            command: Some("/test".to_string()),
            button_label: "Test".to_string(),
            icon: None,
        });

        let triggers = config.effective_triggers();
        assert!(triggers.command.is_some());
        assert_eq!(triggers.command.unwrap().command, Some("/test".to_string()));
    }

    #[test]
    fn test_trigger_config_from_legacy_event() {
        let mut config = make_test_config("test", None);
        config.event_trigger = Some(EventTrigger {
            event_type: EventType::IdeaApproved,
            pattern: None,
            debounce_ms: 1000,
        });

        let triggers = config.effective_triggers();
        assert!(triggers.events.is_some());
        assert_eq!(triggers.events.unwrap().len(), 1);
    }

    #[test]
    fn test_explicit_trigger_config_overrides_legacy() {
        let mut config = make_test_config("test", None);
        config.schedule = Some(AgentSchedule {
            cron: "0 0 * * *".to_string(),
            timezone: None,
        });
        config.triggers = Some(TriggerConfig {
            schedule: None,
            command: Some(InvocationConfig {
                command: Some("/explicit".to_string()),
                button_label: "Explicit".to_string(),
                icon: None,
            }),
            events: None,
            pipeline_stage: None,
        });

        let triggers = config.effective_triggers();
        // Should use explicit config, not legacy schedule
        assert!(triggers.schedule.is_none());
        assert!(triggers.command.is_some());
    }
}
