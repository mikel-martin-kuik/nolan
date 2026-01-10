/**
 * API wrapper for Nolan frontend
 *
 * Provides a unified interface that works in both:
 * - Tauri desktop app (uses IPC)
 * - Browser (uses HTTP REST API)
 *
 * Usage:
 *   import { invoke } from '@/lib/api';
 *   const agents = await invoke<AgentInfo[]>('list_agent_directories');
 */

// API server base URL (configurable via environment variable or localStorage)
const getApiBaseUrl = (): string => {
  // Check localStorage first (user preference)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('nolan-server-url');
    if (stored) return stored;
  }

  // Fall back to environment variable or default
  return import.meta.env.VITE_API_URL || 'http://localhost:3030';
};

const API_BASE = getApiBaseUrl();

// Detect if we're running in Tauri (checked dynamically to handle load order)
// Tauri v2 uses __TAURI_INTERNALS__ instead of __TAURI__
function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
}

/**
 * Command name to HTTP endpoint mapping
 * Most commands map directly, some need special handling
 */
// Helper to get arg with camelCase or snake_case fallback
const getArg = (args: Record<string, unknown>, snakeCase: string): unknown => {
  const camelCase = snakeCase.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return args[snakeCase] ?? args[camelCase];
};

const COMMAND_ROUTES: Record<string, { method: string; path: string | ((args: Record<string, unknown>) => string) }> = {
  // Agents
  list_agent_directories: { method: 'GET', path: '/api/agents' },
  get_agent_metadata: { method: 'GET', path: (args) => `/api/agents/${getArg(args, 'agent_name')}` },
  save_agent_metadata: { method: 'PUT', path: (args) => `/api/agents/${getArg(args, 'agent_name')}` },
  create_agent_directory: { method: 'POST', path: '/api/agents' },
  delete_agent_directory: { method: 'DELETE', path: (args) => `/api/agents/${getArg(args, 'agent_name')}?force=${args.force || false}` },
  get_agent_role_file: { method: 'GET', path: (args) => `/api/agents/${getArg(args, 'agent_name')}/role` },
  save_agent_role_file: { method: 'PUT', path: (args) => `/api/agents/${getArg(args, 'agent_name')}/role` },
  read_agent_claude_md: { method: 'GET', path: (args) => `/api/agents/${args.agent}/claude-md` },
  write_agent_claude_md: { method: 'PUT', path: (args) => `/api/agents/${args.agent}/claude-md` },
  get_agent_template: { method: 'GET', path: (args) => `/api/agents/template?name=${encodeURIComponent(getArg(args, 'agent_name') as string)}&role=${encodeURIComponent(args.role as string)}` },

  // Teams
  list_teams: { method: 'GET', path: '/api/teams' },
  get_team_config: { method: 'GET', path: (args) => `/api/teams/${getArg(args, 'team_name')}` },
  save_team_config: { method: 'PUT', path: (args) => `/api/teams/${getArg(args, 'team_name')}` },
  delete_team: { method: 'DELETE', path: (args) => `/api/teams/${getArg(args, 'team_name')}` },
  rename_team_config: { method: 'POST', path: (args) => `/api/teams/${getArg(args, 'old_name')}/rename/${getArg(args, 'new_name')}` },
  get_departments_config: { method: 'GET', path: '/api/departments' },
  save_departments_config: { method: 'PUT', path: '/api/departments' },

  // Lifecycle
  get_agent_status: { method: 'GET', path: '/api/lifecycle/status/all' },
  list_sessions: { method: 'GET', path: '/api/sessions' },
  launch_team: { method: 'POST', path: '/api/lifecycle/launch-team' },
  kill_team: { method: 'POST', path: '/api/lifecycle/kill-team' },
  start_agent: { method: 'POST', path: '/api/lifecycle/start-agent' },
  spawn_agent: { method: 'POST', path: '/api/lifecycle/spawn-agent' },
  kill_instance: { method: 'POST', path: '/api/lifecycle/kill-instance' },
  kill_all_instances: { method: 'POST', path: '/api/lifecycle/kill-all' },

  // Terminal-related commands that don't work in browser (need gnome-terminal)
  open_agent_terminal: { method: 'POST', path: '/api/noop' },  // No-op in browser
  open_team_terminals: { method: 'POST', path: '/api/noop' },  // No-op in browser

  // Communication
  send_message: { method: 'POST', path: '/api/communicate/message' },
  send_agent_command: { method: 'POST', path: '/api/communicate/command' },
  broadcast_team: { method: 'POST', path: '/api/communicate/broadcast-team' },
  broadcast_all: { method: 'POST', path: '/api/communicate/broadcast-all' },
  get_available_targets: { method: 'GET', path: (args) => `/api/communicate/targets?team=${encodeURIComponent(getArg(args, 'team_name') as string || 'default')}` },

  // Projects
  list_projects: { method: 'GET', path: '/api/projects' },
  create_project: { method: 'POST', path: '/api/projects' },
  list_project_files: { method: 'GET', path: (args) => `/api/projects/${getArg(args, 'project_name') || args.name}/files` },
  read_project_file: { method: 'GET', path: (args) => `/api/projects/${getArg(args, 'project_name') || args.name}/file?path=${encodeURIComponent((getArg(args, 'file_path') || args.relative_path) as string)}` },
  write_project_file: { method: 'PUT', path: (args) => `/api/projects/${getArg(args, 'project_name') || args.name}/file` },
  get_project_team: { method: 'GET', path: (args) => `/api/projects/${getArg(args, 'project_name')}/team` },
  set_project_team: { method: 'PUT', path: (args) => `/api/projects/${getArg(args, 'project_name')}/team` },
  update_project_status: { method: 'PUT', path: (args) => `/api/projects/${getArg(args, 'project_name')}/status` },
  update_file_marker: { method: 'PUT', path: (args) => `/api/projects/${getArg(args, 'project_name')}/file-marker` },
  read_roadmap: { method: 'GET', path: '/api/projects/roadmap' },

  // Terminal
  start_terminal_stream: { method: 'POST', path: '/api/terminal/start' },
  stop_terminal_stream: { method: 'POST', path: '/api/terminal/stop' },
  send_terminal_input: { method: 'POST', path: '/api/terminal/input' },
  send_terminal_key: { method: 'POST', path: '/api/terminal/key' },
  resize_terminal: { method: 'POST', path: '/api/terminal/resize' },

  // History
  start_history_stream: { method: 'POST', path: '/api/noop' },  // No-op - uses WebSocket
  stop_history_stream: { method: 'POST', path: '/api/noop' },   // No-op
  load_history_entries: { method: 'GET', path: (args) => {
    const hours = args.hours || 1;
    return `/api/history/entries?hours=${hours}`;
  }},
  load_history_for_active_sessions: { method: 'GET', path: (args) => {
    const sessions = Array.isArray(args.activeSessions) ? args.activeSessions.join(',') : '';
    const hours = args.hours || 1;
    return `/api/history/active?activeSessions=${encodeURIComponent(sessions)}&hours=${hours}`;
  }},

  // Usage stats
  get_usage_stats: { method: 'GET', path: (args) => {
    const days = args?.days;
    return days ? `/api/usage/stats?days=${days}` : '/api/usage/stats';
  }},
  get_session_stats: { method: 'GET', path: (args) => {
    const params = new URLSearchParams();
    if (args?.since) params.set('since', args.since as string);
    if (args?.until) params.set('until', args.until as string);
    if (args?.order) params.set('order', args.order as string);
    const qs = params.toString();
    return qs ? `/api/usage/sessions?${qs}` : '/api/usage/sessions';
  }},
  get_usage_by_date_range: { method: 'GET', path: (args) => `/api/usage/range?startDate=${encodeURIComponent(getArg(args, 'start_date') as string)}&endDate=${encodeURIComponent(getArg(args, 'end_date') as string)}` },

  // Cronos (cron agents)
  list_cron_agents: { method: 'GET', path: '/api/cronos/agents' },
  get_cron_agent: { method: 'GET', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}` },
  create_cron_agent: { method: 'POST', path: '/api/cronos/agents' },
  update_cron_agent: { method: 'PUT', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}` },
  delete_cron_agent: { method: 'DELETE', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}` },
  toggle_cron_agent: { method: 'POST', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/toggle` },
  test_cron_agent: { method: 'POST', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/test` },
  trigger_cron_agent: { method: 'POST', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/trigger` },
  get_cron_run_history: { method: 'GET', path: (args) => {
    const name = getArg(args, 'name') || getArg(args, 'agent_name');
    const limit = args?.limit;
    if (name) {
      return limit ? `/api/cronos/agents/${name}/history?limit=${limit}` : `/api/cronos/agents/${name}/history`;
    }
    return limit ? `/api/cronos/history?limit=${limit}` : '/api/cronos/history';
  }},
  get_cron_run_log: { method: 'GET', path: (args) => `/api/cronos/runs/${getArg(args, 'run_id')}/log` },
  read_cron_agent_claude_md: { method: 'GET', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/claude-md` },
  write_cron_agent_claude_md: { method: 'PUT', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/claude-md` },
  init_cronos: { method: 'POST', path: '/api/cronos/init' },
  shutdown_cronos: { method: 'POST', path: '/api/cronos/shutdown' },
  // New cronos commands
  cancel_cron_agent: { method: 'POST', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/cancel` },
  get_running_agents: { method: 'GET', path: '/api/cronos/running' },
  get_cronos_health: { method: 'GET', path: '/api/cronos/health' },
  get_agent_stats: { method: 'GET', path: (args) => `/api/cronos/agents/${getArg(args, 'name')}/stats` },
  subscribe_cron_output: { method: 'POST', path: '/api/noop' },  // WebSocket only - no-op in REST
  get_cron_next_runs: { method: 'GET', path: (args) => `/api/cronos/cron/next?expression=${encodeURIComponent(getArg(args, 'expression') as string)}&count=${args.count || 5}` },
  describe_cron_expression: { method: 'GET', path: (args) => `/api/cronos/cron/describe?expression=${encodeURIComponent(getArg(args, 'expression') as string)}` },
};

/**
 * Invoke a backend command
 *
 * In Tauri: Uses native IPC
 * In Browser: Uses HTTP REST API
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    // Use native Tauri IPC
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }

  // Use HTTP API
  const route = COMMAND_ROUTES[cmd];
  if (!route) {
    throw new Error(`Unknown command: ${cmd}. Add it to COMMAND_ROUTES in api.ts`);
  }

  const { method, path } = route;
  const url = API_BASE + (typeof path === 'function' ? path(args || {}) : path);

  // Get session token from localStorage
  const sessionToken = typeof window !== 'undefined'
    ? localStorage.getItem('nolan-session-token')
    : null;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Nolan-Session': sessionToken } : {}),
    },
  };

  // Add body for POST/PUT/DELETE methods
  if (['POST', 'PUT', 'DELETE'].includes(method) && args) {
    options.body = JSON.stringify(args);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

/**
 * Check if running in browser mode (not Tauri)
 */
export function isBrowserMode(): boolean {
  return !isTauri();
}

/**
 * Get the API base URL (useful for WebSocket connections)
 */
export function getApiBase(): string {
  return API_BASE;
}

/**
 * Get WebSocket URL for a given endpoint
 */
export function getWebSocketUrl(endpoint: string): string {
  const base = API_BASE.replace(/^http/, 'ws');
  return `${base}${endpoint}`;
}
