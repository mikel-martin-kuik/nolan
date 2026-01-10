// Cronos - Cron Agents Type Definitions

export interface CronAgentConfig {
  name: string;
  description: string;
  model: string;
  timeout: number;
  enabled: boolean;
  schedule: CronSchedule;
  guardrails: CronGuardrails;
  context: CronContext;
  // New enhanced fields
  concurrency: ConcurrencyPolicy;
  retry: RetryPolicy;
  catch_up: CatchUpPolicy;
}

export interface CronSchedule {
  cron: string;
  timezone?: string;
}

export interface CronGuardrails {
  allowed_tools: string[];
  forbidden_paths?: string[];
  max_file_edits?: number;
}

export interface CronContext {
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
export interface CronAgentInfo {
  name: string;
  description: string;
  model: string;
  enabled: boolean;
  schedule: string;
  cron_expression: string;
  next_run?: string;
  last_run?: CronRunLog;
  // New monitoring fields
  is_running: boolean;
  current_run_id?: string;
  consecutive_failures: number;
  health: AgentHealth;
  stats: AgentStats;
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
}

export interface CronRunLog {
  run_id: string;
  agent_name: string;
  started_at: string;
  completed_at?: string;
  status: CronRunStatus;
  duration_secs?: number;
  exit_code?: number;
  output_file: string;
  error?: string;
  // New fields
  attempt: number;
  trigger: RunTrigger;
}

export type CronRunStatus = 'running' | 'success' | 'failed' | 'timeout' | 'cancelled' | 'skipped' | 'retrying';

export type RunTrigger = 'scheduled' | 'manual' | 'retry' | 'catch_up';

export interface TestRunResult {
  success: boolean;
  output: string;
  duration_secs: number;
}

// Real-time output streaming
export interface CronOutputEvent {
  run_id: string;
  agent_name: string;
  event_type: OutputEventType;
  content: string;
  timestamp: string;
}

export type OutputEventType = 'stdout' | 'stderr' | 'status' | 'complete';

// Health summary for dashboard
export interface CronosHealthSummary {
  total_agents: number;
  active_agents: number;
  running_agents: number;
  healthy_agents: number;
  warning_agents: number;
  critical_agents: number;
  recent_runs: CronRunLog[];
  success_rate_7d: number;
  success_rate_30d: number;
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
export function createDefaultCronAgentConfig(name: string): CronAgentConfig {
  return {
    name,
    description: '',
    model: 'sonnet',
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
export function getStatusColor(status: CronRunStatus): string {
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

// Agent template definitions
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  config: Partial<CronAgentConfig>;
  claudeMd: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'git-commit',
    name: 'Git Commit',
    description: 'Automatically commit changes to git repository',
    config: {
      model: 'haiku',
      timeout: 300,
      schedule: { cron: '0 */4 * * *' },
      guardrails: {
        allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        forbidden_paths: ['**/.env', '**/secrets/**', '**/*.key'],
        max_file_edits: 5,
      },
    },
    claudeMd: `# Git Commit Agent

## Instructions

Commit all changes in the repository.

1. Run \`git status\` to see what files have changed
2. Run \`git diff\` to review the changes
3. If there are changes, create a commit with a descriptive message
4. Do NOT push to remote unless explicitly configured

## Guidelines

- Write clear, concise commit messages
- Group related changes together
- Skip GPG signing: use --no-gpg-sign flag
`,
  },
  {
    id: 'backup',
    name: 'Backup',
    description: 'Create backups of important files or directories',
    config: {
      model: 'haiku',
      timeout: 600,
      schedule: { cron: '0 0 * * *' },
      guardrails: {
        allowed_tools: ['Read', 'Glob', 'Bash'],
        forbidden_paths: ['**/.env', '**/secrets/**'],
        max_file_edits: 0,
      },
    },
    claudeMd: `# Backup Agent

## Instructions

Create a backup of specified directories.

1. Identify files that need backing up
2. Create timestamped backup archives
3. Verify backup integrity
4. Clean up old backups (keep last 7 days)

## Configuration

Set the backup source and destination in the working directory context.
`,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review recent code changes and generate reports',
    config: {
      model: 'sonnet',
      timeout: 900,
      schedule: { cron: '0 9 * * 1-5' },
      guardrails: {
        allowed_tools: ['Read', 'Glob', 'Grep'],
        forbidden_paths: ['**/.env', '**/secrets/**', '**/*.key'],
        max_file_edits: 1,
      },
    },
    claudeMd: `# Code Review Agent

## Instructions

Review recent code changes and generate a summary report.

1. Get recent commits from the past 24 hours
2. Analyze code quality, patterns, and potential issues
3. Generate a markdown report with findings
4. Save report to ./reports/code-review-{date}.md

## Focus Areas

- Security vulnerabilities
- Performance issues
- Code style consistency
- Documentation gaps
`,
  },
  {
    id: 'dependency-check',
    name: 'Dependency Check',
    description: 'Check for outdated or vulnerable dependencies',
    config: {
      model: 'haiku',
      timeout: 600,
      schedule: { cron: '0 8 * * 1' },
      guardrails: {
        allowed_tools: ['Read', 'Glob', 'Bash'],
        forbidden_paths: ['**/.env', '**/secrets/**'],
        max_file_edits: 0,
      },
    },
    claudeMd: `# Dependency Check Agent

## Instructions

Check for outdated or vulnerable dependencies.

1. Run \`npm outdated\` or equivalent for the project
2. Check for security vulnerabilities
3. Generate a report of findings
4. Flag any critical updates needed

## Output

Create a summary of:
- Outdated packages
- Security vulnerabilities
- Recommended updates
`,
  },
  {
    id: 'cleanup',
    name: 'Cleanup',
    description: 'Clean up temporary files and old artifacts',
    config: {
      model: 'haiku',
      timeout: 300,
      schedule: { cron: '0 2 * * 0' },
      guardrails: {
        allowed_tools: ['Read', 'Glob', 'Bash'],
        forbidden_paths: ['**/.env', '**/secrets/**', '**/node_modules/**'],
        max_file_edits: 0,
      },
    },
    claudeMd: `# Cleanup Agent

## Instructions

Clean up temporary files and old artifacts.

1. Find and remove:
   - Build artifacts older than 7 days
   - Log files older than 30 days
   - Temporary files
   - Cache directories

2. Report space reclaimed

## Safety

- NEVER delete source code
- NEVER delete configuration files
- Always verify before deletion
`,
  },
];
