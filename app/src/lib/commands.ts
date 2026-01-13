/**
 * Type-safe Tauri command invocation
 *
 * This module provides compile-time type checking for Tauri IPC calls.
 * All parameter keys MUST use snake_case to match the Rust backend's
 * `#[tauri::command(rename_all = "snake_case")]` configuration.
 *
 * Usage:
 *   import { invokeCommand } from '@/lib/commands';
 *   const team = await invokeCommand('get_team_config', { team_name: 'default' });
 *
 * Benefits:
 * - TypeScript errors if you use wrong parameter names
 * - Autocomplete for command names and parameters
 * - Return type inference
 */

import { invoke } from './api';
import type {
  AgentDirectoryInfo,
  AgentMetadata,
  AgentStatusList,
  TeamConfig,
  ClaudeModel,
  DepartmentsConfig,
} from '@/types';

// =============================================================================
// Command Parameter Types (snake_case required!)
// =============================================================================

/**
 * All Tauri commands with their parameter types.
 *
 * IMPORTANT: Parameter keys MUST be snake_case!
 * The Rust backend uses `rename_all = "snake_case"`.
 *
 * ✅ Correct: { team_name: 'default' }
 * ❌ Wrong:   { teamName: 'default' }
 */
export interface CommandParams {
  // === Agents ===
  list_agent_directories: void;
  create_agent_directory: { agent_name: string };
  delete_agent_directory: { agent_name: string; force?: boolean };
  get_agent_role_file: { agent_name: string };
  save_agent_role_file: { agent_name: string; content: string };
  get_agent_metadata: { agent_name: string };
  save_agent_metadata: { agent_name: string; role: string; model: string };
  get_agent_template: { agent_name: string; role: string };
  read_agent_claude_md: { agent: string };
  write_agent_claude_md: { agent: string; content: string };

  // === Teams ===
  list_teams: void;
  get_team_config: { team_name: string };
  save_team_config: { team_name: string; config: TeamConfig };
  delete_team: { team_name: string };
  rename_team_config: { old_name: string; new_name: string };
  get_departments_config: void;
  save_departments_config: { config: DepartmentsConfig };

  // === Lifecycle ===
  get_agent_status: void;
  launch_team: {
    team_name: string;
    project_name: string;
    initial_prompt?: string;
    updated_original_prompt?: string;
    followup_prompt?: string;
  };
  kill_team: { team_name: string };
  spawn_agent: {
    team_name: string;
    agent: string;
    force?: boolean;
    model?: ClaudeModel;
    chrome?: boolean;
    worktree_path?: string;
  };
  start_agent: { team_name: string; agent: string };
  kill_instance: { session: string };
  kill_all_instances: { team_name: string; agent: string };
  open_agent_terminal: { session: string };
  open_team_terminals: { team_name: string };

  // === Communication ===
  send_message: { session: string; message: string };
  send_agent_command: { session: string; command: string };
  broadcast_team: { team_name: string; message: string };
  broadcast_all: { message: string };
  get_available_targets: { team_name?: string };

  // === Projects ===
  list_projects: void;
  create_project: { name: string; description?: string };
  get_project_team: { project_name: string };
  set_project_team: { project_name: string; team_name: string };
  list_project_files: { project_name: string };
  read_project_file: { project_name: string; file_path: string };
  write_project_file: { project_name: string; file_path: string; content: string };
  update_project_status: { project_name: string; status: string };

  // === History ===
  load_history_entries: { hours?: number };
  load_history_for_active_sessions: { activeSessions: string[]; hours?: number };

  // === Usage ===
  get_usage_stats: { days?: number };
  get_session_stats: { since?: string; until?: string; order?: string };
  get_usage_by_date_range: { start_date: string; end_date: string };
  get_agent_usage_stats: { agent_name: string; days?: number };

  // === Sessions ===
  list_sessions: void;
  list_session_labels: void;

  // === Worktrees ===
  list_worktrees: void;
  cleanup_worktrees: void;
  remove_worktree: { path: string };
}

// =============================================================================
// Command Return Types
// =============================================================================

export interface CommandReturns {
  // Agents
  list_agent_directories: AgentDirectoryInfo[];
  create_agent_directory: string;
  delete_agent_directory: void;
  get_agent_role_file: string;
  save_agent_role_file: void;
  get_agent_metadata: AgentMetadata | null;
  save_agent_metadata: void;
  get_agent_template: string;
  read_agent_claude_md: string;
  write_agent_claude_md: string;

  // Teams
  list_teams: string[];
  get_team_config: TeamConfig;
  save_team_config: void;
  delete_team: void;
  rename_team_config: void;
  get_departments_config: DepartmentsConfig;
  save_departments_config: void;

  // Lifecycle
  get_agent_status: AgentStatusList;
  launch_team: string;
  kill_team: string;
  spawn_agent: string;
  start_agent: string;
  kill_instance: string;
  kill_all_instances: string;
  open_agent_terminal: string;
  open_team_terminals: string;

  // Communication
  send_message: string;
  send_agent_command: string;
  broadcast_team: string;
  broadcast_all: string;
  get_available_targets: string[];

  // Projects
  list_projects: unknown[];
  create_project: unknown;
  get_project_team: string | null;
  set_project_team: void;
  list_project_files: unknown[];
  read_project_file: string;
  write_project_file: void;
  update_project_status: void;

  // History
  load_history_entries: unknown[];
  load_history_for_active_sessions: unknown[];

  // Usage
  get_usage_stats: unknown;
  get_session_stats: unknown[];
  get_usage_by_date_range: unknown;
  get_agent_usage_stats: unknown;

  // Sessions
  list_sessions: string[];
  list_session_labels: Record<string, string>;

  // Worktrees
  list_worktrees: unknown[];
  cleanup_worktrees: unknown;
  remove_worktree: void;
}

// =============================================================================
// Type-Safe Invoke Function
// =============================================================================

type CommandName = keyof CommandParams;

/**
 * Type-safe invoke for Tauri commands.
 *
 * Provides compile-time checking of:
 * - Command names (typos caught at build time)
 * - Parameter names (snake_case enforced)
 * - Parameter types
 * - Return types
 *
 * @example
 * // TypeScript will error if you use camelCase
 * await invokeCommand('get_team_config', { team_name: 'default' }); // ✅
 * await invokeCommand('get_team_config', { teamName: 'default' });  // ❌ Type error!
 */
export function invokeCommand<T extends CommandName>(
  command: T,
  ...args: CommandParams[T] extends void ? [] : [CommandParams[T]]
): Promise<CommandReturns[T]> {
  const params = args[0] as Record<string, unknown> | undefined;
  return invoke<CommandReturns[T]>(command, params);
}

// =============================================================================
// Runtime Validation (Development Mode)
// =============================================================================

/**
 * Validate that all parameter keys are snake_case.
 * Call this in development to catch issues early.
 */
export function validateSnakeCaseParams(
  command: string,
  params: Record<string, unknown> | undefined
): void {
  if (!params || import.meta.env.PROD) return;

  const camelCaseKeys = Object.keys(params).filter(key => {
    // snake_case should not have uppercase letters
    return /[A-Z]/.test(key);
  });

  if (camelCaseKeys.length > 0) {
    console.error(
      `[Tauri IPC] Command '${command}' has camelCase parameter keys: ${camelCaseKeys.join(', ')}\n` +
      `Parameter keys must be snake_case to match Rust backend.\n` +
      `Fix: Use ${camelCaseKeys.map(k => `'${toSnakeCase(k)}'`).join(', ')} instead.`
    );
  }
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
