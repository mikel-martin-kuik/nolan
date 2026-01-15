// Scheduler - Scheduled Agents Type Definitions

// Agent role - what the agent does (identity, separate from trigger mechanism)
export type AgentRole = 'implementer' | 'analyzer' | 'tester' | 'merger' | 'builder' | 'scanner' | 'indexer' | 'monitor' | 'researcher' | 'planner' | 'free';

// Display labels for agent roles
export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  implementer: 'Implementers',
  analyzer: 'Analyzers',
  tester: 'Testers',
  merger: 'Mergers',
  builder: 'Builders',
  scanner: 'Scanners',
  indexer: 'Indexers',
  monitor: 'Monitors',
  researcher: 'Researchers',
  planner: 'Planners',
  free: 'Free Agents',
};

// Supported event types for event-driven agents
export type EventType =
  | 'idea_approved'
  | 'idea_received'
  | 'team_workflow_started'
  | 'team_workflow_finished'
  | 'user_logged_in'
  | 'git_push'
  | 'file_changed'
  | 'state_change';

// Event trigger configuration (for Event type agents)
export interface EventTrigger {
  event_type: EventType;
  pattern?: string;       // Optional regex/glob pattern
  debounce_ms: number;    // Debounce to avoid rapid re-triggers
}

// Invocation configuration (for Predefined type agents)
export interface InvocationConfig {
  command?: string;       // Slash command: /security-scan
  button_label: string;   // UI button text
  icon?: string;          // Icon name (lucide icon)
}

// Post-run analyzer configuration
export interface PostRunAnalyzerConfig {
  analyzer_agent: string;  // Name of the analyzer agent to trigger
  on_success: boolean;     // Trigger analyzer on success
  on_failure: boolean;     // Trigger analyzer on failure
  on_timeout: boolean;     // Trigger analyzer on timeout
}

export interface ScheduledAgentConfig {
  name: string;
  description: string;
  model: string;
  timeout: number;
  enabled: boolean;
  schedule?: ScheduleConfig;          // For scheduled agents
  guardrails: ScheduleGuardrails;
  context: ScheduleContext;
  // Group assignment (references groups.yaml)
  group?: string;
  // New enhanced fields
  concurrency: ConcurrencyPolicy;
  retry: RetryPolicy;
  catch_up: CatchUpPolicy;
  event_trigger?: EventTrigger;     // For Event type
  invocation?: InvocationConfig;    // For Predefined type
  post_run_analyzer?: PostRunAnalyzerConfig;  // Post-run analyzer configuration
}

// Scheduled agent group definition
export interface ScheduledAgentGroup {
  id: string;
  name: string;
  order: number;
}

export interface ScheduleConfig {
  cron: string;
  timezone?: string;
}

export interface ScheduleGuardrails {
  allowed_tools: string[];
  forbidden_paths?: string[];
  max_file_edits?: number;
}

export interface ScheduleContext {
  working_directory?: string;
}

// New policy types
export interface ConcurrencyPolicy {
  allow_parallel: boolean;
  queue_if_running: boolean;
}

export interface RetryPolicy {
  enabled: boolean;
  max_retries: number;
  delay_secs: number;
  exponential_backoff: boolean;
}

export type CatchUpPolicy = 'skip' | 'run_once' | 'run_all';

// Enhanced agent info with health and stats
export interface ScheduledAgentInfo {
  name: string;
  description: string;
  model: string;
  enabled: boolean;
  role: AgentRole;                 // Agent role - what this agent does (identity)
  schedule: string;
  cron_expression: string;
  next_run?: string;
  last_run?: ScheduledRunLog;
  // Group assignment
  group?: string;
  // New monitoring fields
  is_running: boolean;
  current_run_id?: string;
  consecutive_failures: number;
  health: AgentHealth;
  stats: AgentStats;
  // New fields for predefined/event agents
  event_trigger?: EventTrigger;
  invocation?: InvocationConfig;
}

export interface AgentHealth {
  status: HealthStatus;
  message?: string;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface AgentStats {
  total_runs: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_duration_secs?: number;
  total_cost_usd?: number;
  avg_cost_usd?: number;
}

export interface ScheduledRunLog {
  run_id: string;
  agent_name: string;
  started_at: string;
  completed_at?: string;
  status: ScheduledRunStatus;
  duration_secs?: number;
  exit_code?: number;
  output_file: string;
  error?: string;
  // New fields
  attempt: number;
  trigger: RunTrigger;
  // Session tracking for relaunch capability
  session_name?: string;
  run_dir?: string;
  claude_session_id?: string;
  // Cost tracking
  total_cost_usd?: number;
  // Worktree isolation
  worktree_path?: string;
  worktree_branch?: string;
  base_commit?: string;
  // Analyzer verdict (populated after analyzer agent runs)
  analyzer_verdict?: AnalyzerVerdict;
  // Pipeline ID this run belongs to (if part of a pipeline)
  pipeline_id?: string;
  // Parent run ID (for analyzer runs, this points to the implementer run being analyzed)
  parent_run_id?: string;
}

export type ScheduledRunStatus = 'running' | 'success' | 'failed' | 'timeout' | 'cancelled' | 'skipped' | 'retrying' | 'interrupted';

// Analyzer verdict types
export type AnalyzerVerdictType = 'COMPLETE' | 'FOLLOWUP' | 'FAILED';

export interface AnalyzerVerdict {
  verdict: AnalyzerVerdictType;
  reason: string;
  follow_up_prompt?: string;
  findings: string[];
  analyzer_run_id?: string;
}

export type RunTrigger = 'scheduled' | 'manual' | 'retry' | 'catch_up';

export interface TestRunResult {
  success: boolean;
  output: string;
  duration_secs: number;
}

// Real-time output streaming
export interface ScheduledOutputEvent {
  run_id: string;
  agent_name: string;
  event_type: OutputEventType;
  content: string;
  timestamp: string;
}

export type OutputEventType = 'stdout' | 'stderr' | 'status' | 'complete';

// Health summary for dashboard
export interface SchedulerHealthSummary {
  total_agents: number;
  active_agents: number;
  running_agents: number;
  healthy_agents: number;
  warning_agents: number;
  critical_agents: number;
  recent_runs: ScheduledRunLog[];
  success_rate_7d: number;
  success_rate_30d: number;
  total_cost_7d: number;
}

// Running agent info
export interface RunningAgentInfo {
  run_id: string;
  agent_name: string;
  started_at: string;
  duration_secs: number;
}

// Cron description result
export interface CronDescription {
  expression: string;
  human_readable: string;
  next_runs: string[];
}

// Common cron schedule presets
export const CRON_PRESETS = [
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 2 hours', cron: '0 */2 * * *' },
  { label: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Daily at 6pm', cron: '0 18 * * *' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Weekly on Sunday', cron: '0 0 * * 0' },
  { label: 'Monthly on 1st', cron: '0 0 1 * *' },
] as const;

// Available tools for guardrails
export const CRON_AVAILABLE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
] as const;

// Model options
export const CRON_MODELS = [
  { id: 'haiku', label: 'Haiku', hint: 'Fast & cheap' },
  { id: 'sonnet', label: 'Sonnet', hint: 'Balanced' },
  { id: 'opus', label: 'Opus', hint: 'Powerful' },
] as const;

// Catch-up policy options
export const CATCH_UP_POLICIES = [
  { id: 'skip' as CatchUpPolicy, label: 'Skip', hint: 'Don\'t run missed executions' },
  { id: 'run_once' as CatchUpPolicy, label: 'Run Once', hint: 'Run once if any were missed' },
  { id: 'run_all' as CatchUpPolicy, label: 'Run All', hint: 'Run all missed executions' },
] as const;

// Default config for new agents
export function createDefaultScheduledAgentConfig(name: string, group?: string): ScheduledAgentConfig {
  return {
    name,
    description: '',
    model: 'opus',
    timeout: 300,
    enabled: false,
    schedule: {
      cron: '0 9 * * 1', // Weekly on Monday at 9am
    },
    guardrails: {
      allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      forbidden_paths: ['**/.env', '**/secrets/**', '**/*.key'],
      max_file_edits: 10,
    },
    context: {},
    group,
    // New defaults
    concurrency: {
      allow_parallel: false,
      queue_if_running: false,
    },
    retry: {
      enabled: false,
      max_retries: 3,
      delay_secs: 60,
      exponential_backoff: false,
    },
    catch_up: 'skip',
  };
}

// Helper to get status badge color
export function getStatusColor(status: ScheduledRunStatus): string {
  switch (status) {
    case 'success': return 'text-green-500';
    case 'running': return 'text-blue-500';
    case 'failed': return 'text-red-500';
    case 'timeout': return 'text-orange-500';
    case 'cancelled': return 'text-gray-500';
    case 'skipped': return 'text-yellow-500';
    case 'retrying': return 'text-purple-500';
    default: return 'text-gray-400';
  }
}

// Helper to get health status color
export function getHealthColor(status: HealthStatus): string {
  switch (status) {
    case 'healthy': return 'text-green-500';
    case 'warning': return 'text-yellow-500';
    case 'critical': return 'text-red-500';
    case 'unknown': return 'text-gray-400';
    default: return 'text-gray-400';
  }
}

