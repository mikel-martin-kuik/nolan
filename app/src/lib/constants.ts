/**
 * Centralized Constants for Nolan Frontend
 *
 * This file is the single source of truth for hardcoded values that are used
 * across multiple files. Changes here automatically propagate everywhere.
 *
 * RUNTIME CONFIGURATION (Docker-friendly):
 * Some values can be overridden via environment variables on the backend.
 * Use the hooks from useUIConfig.ts to get runtime values:
 *
 *   import { useOllamaDefaults, useRuntimeConfig, useSessionPrefixes } from '@/hooks/useUIConfig';
 *
 *   // In a React component:
 *   const ollamaDefaults = useOllamaDefaults();  // { url, model } from OLLAMA_URL, OLLAMA_MODEL
 *   const runtime = useRuntimeConfig();          // { api_port, nolan_root, role_filename, team_filename }
 *   const prefixes = useSessionPrefixes();       // { team, cron, predefined }
 *
 * Environment Variables (set on backend/Docker container):
 *   OLLAMA_URL      - Ollama server URL (default: http://localhost:11434)
 *   OLLAMA_MODEL    - Default Ollama model (default: qwen2.5:1.5b)
 *   NOLAN_API_PORT  - API server port (default: 3030)
 *   NOLAN_ROOT      - Nolan data directory (default: ~/.nolan)
 *
 * The constants below are FALLBACKS used when:
 * - Backend config hasn't loaded yet
 * - Running in Tauri desktop mode without remote server
 * - localStorage values before first sync
 *
 * Categories:
 * - File names and paths
 * - LocalStorage keys
 * - Default URLs and ports (fallbacks - prefer runtime config)
 * - Event names
 * - Session prefixes (fallbacks - prefer runtime config)
 * - WebSocket endpoints
 */

// =============================================================================
// File Names
// =============================================================================

/** The role/instructions file for agents (Claude's CLAUDE.md) */
export const CLAUDE_MD_FILENAME = 'CLAUDE.md';

/** Team configuration file name */
export const TEAM_YAML_FILENAME = 'team.yaml';

// =============================================================================
// LocalStorage Keys
// =============================================================================

/** Session authentication token */
export const STORAGE_SESSION_TOKEN = 'nolan-session-token';

/** Server URL for remote connections */
export const STORAGE_SERVER_URL = 'nolan-server-url';

/** UI theme preference (dark/light/system) */
export const STORAGE_UI_THEME = 'nolan-ui-theme';

/** Ralph agent display name */
export const STORAGE_RALPH_DISPLAY_NAME = 'nolan-ralph-display-name';

/** Ollama server URL */
export const STORAGE_OLLAMA_URL = 'nolan-ollama-url';

/** Ollama selected model */
export const STORAGE_OLLAMA_MODEL = 'nolan-ollama-model';

/** Terminal window size */
export const STORAGE_TERMINAL_SIZE = 'nolan-terminal-size';

/** Terminal font size */
export const STORAGE_TERMINAL_FONT_SIZE = 'nolan-terminal-font-size';

// =============================================================================
// Default URLs and Ports
// =============================================================================

/** Default Nolan backend port */
export const DEFAULT_NOLAN_PORT = 3030;

/** Default Nolan backend URL */
export const DEFAULT_NOLAN_URL = `http://localhost:${DEFAULT_NOLAN_PORT}`;

/** Default Ollama server URL */
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Default Ollama model */
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:1.5b';

// =============================================================================
// Event Names (for Tauri events and internal pub/sub)
// =============================================================================

/** Agent status changed event */
export const EVENT_AGENT_STATUS_CHANGED = 'agent-status-changed';

/** Terminal output event */
export const EVENT_TERMINAL_OUTPUT = 'terminal-output';

/** Terminal disconnected event */
export const EVENT_TERMINAL_DISCONNECTED = 'terminal-disconnected';

/** History entry event */
export const EVENT_HISTORY_ENTRY = 'history-entry';

/** Session label changed event */
export const EVENT_SESSION_LABEL_CHANGED = 'session-label-changed';

// =============================================================================
// Session Prefixes
// =============================================================================

/** Prefix for team agent sessions (e.g., agent-default-ana) */
export const SESSION_PREFIX_TEAM = 'agent-';

/** Prefix for cron agent sessions (e.g., cron-daily-backup) */
export const SESSION_PREFIX_CRON = 'cron-';

/** Prefix for predefined agent sessions (e.g., pred-analyzer) */
export const SESSION_PREFIX_PREDEFINED = 'pred-';

// =============================================================================
// WebSocket Endpoints
// =============================================================================

/** Base path for WebSocket connections */
export const WS_BASE_PATH = '/api/ws';

/** WebSocket endpoints mapping */
export const WS_ENDPOINTS = {
  /** Agent status updates */
  status: `${WS_BASE_PATH}/status`,
  /** History entry updates */
  history: `${WS_BASE_PATH}/history`,
  /** Terminal output for a session (append session name) */
  terminal: (session: string) => `${WS_BASE_PATH}/terminal/${session}`,
  /** Generic event stream (append event name) */
  event: (eventName: string) => `${WS_BASE_PATH}/${eventName}`,
} as const;

// =============================================================================
// API Endpoints (for auth - not in COMMAND_ROUTES)
// =============================================================================

/** Auth API endpoints */
export const AUTH_ENDPOINTS = {
  /** Check auth status */
  status: '/api/auth/status',
  /** Login with password */
  login: '/api/auth/login',
  /** Logout current session */
  logout: '/api/auth/logout',
  /** Initial password setup */
  setup: '/api/auth/setup',
} as const;

// =============================================================================
// Directory Paths (relative to NOLAN_HOME ~/.nolan)
// =============================================================================

/** Free agents directory */
export const DIR_AGENTS = 'agents';

/** Teams directory */
export const DIR_TEAMS = 'teams';

/** Event agents directory */
export const DIR_EVENT_AGENTS = 'event/agents';

// =============================================================================
// Session Regex Patterns
// =============================================================================
// Note: Primary patterns are in agentIdentity.ts, but we export spawned pattern here
// since it's used in multiple places.

/**
 * Matches team agent spawned sessions: agent-{team}-{name}-{instance}
 * Example: agent-default-ana-2
 * Groups: [1] team, [2] agent name, [3] instance number
 */
export const RE_TEAM_SPAWNED_SESSION = /^agent-([a-z][a-z0-9_]*)-([a-z][a-z0-9_]*)-(\d+)$/;
