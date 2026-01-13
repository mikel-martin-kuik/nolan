/**
 * UI Configuration Types
 *
 * Matches backend UIConfig structure from ~/.nolan/config.yaml
 * Provides type-safe access to configurable UI metadata.
 */

/** Status configuration with label and color */
export interface StatusConfig {
  value: string;
  label: string;
  color: string;
}

/** Agent display name entry */
export interface AgentDisplayName {
  name: string;
}

/** Session prefix configuration for agent filtering */
export interface SessionPrefixConfig {
  team: string;
  cron: string;
  predefined: string;
}

/** Ollama default configuration */
export interface OllamaDefaults {
  url: string;
  model: string;
}

/** Runtime configuration from environment variables */
export interface RuntimeConfig {
  /** API server port (from NOLAN_API_PORT) */
  api_port: number;
  /** Nolan root directory (from NOLAN_ROOT) */
  nolan_root: string;
  /** Role file name for agents (e.g., "CLAUDE.md") */
  role_filename: string;
  /** Team config file name (e.g., "team.yaml") */
  team_filename: string;
}

/** Root UI configuration from backend */
export interface UIConfig {
  project_statuses: StatusConfig[];
  workflow_statuses: StatusConfig[];
  feature_request_statuses: StatusConfig[];
  idea_statuses: StatusConfig[];
  idea_review_statuses: StatusConfig[];
  idea_complexity_levels: StatusConfig[];
  decision_statuses: StatusConfig[];
  agent_display_names: AgentDisplayName[];
  session_prefixes: SessionPrefixConfig;
  ollama_defaults: OllamaDefaults;
  /** Runtime configuration from environment variables */
  runtime: RuntimeConfig;
}

/** Helper type for creating lookup maps from status arrays */
export type StatusConfigMap<T extends string = string> = Record<T, { label: string; color: string }>;
