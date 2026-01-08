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

export interface CronAgentInfo {
  name: string;
  description: string;
  model: string;
  enabled: boolean;
  schedule: string;
  next_run?: string;
  last_run?: CronRunLog;
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
}

export type CronRunStatus = 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

export interface TestRunResult {
  success: boolean;
  output: string;
  duration_secs: number;
}

// Common cron schedule presets
export const CRON_PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Weekly on Sunday', cron: '0 0 * * 0' },
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
  { id: 'sonnet', label: 'Sonnet', hint: 'Balanced' },
  { id: 'haiku', label: 'Haiku', hint: 'Fast & cheap' },
  { id: 'opus', label: 'Opus', hint: 'Powerful' },
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
  };
}
