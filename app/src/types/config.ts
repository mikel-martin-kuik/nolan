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

/** Pipeline stage configuration with icon name */
export interface PipelineStageConfig {
  value: string;
  label: string;
  icon: string;
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

/** SSH terminal configuration for web-based terminal access */
export interface SshTerminalConfig {
  base_url: string;
  enabled: boolean;
}

/** Root UI configuration from backend */
export interface UIConfig {
  project_statuses: StatusConfig[];
  workflow_statuses: StatusConfig[];
  pipeline_stages: PipelineStageConfig[];
  pipeline_statuses: StatusConfig[];
  feature_request_statuses: StatusConfig[];
  idea_statuses: StatusConfig[];
  idea_review_statuses: StatusConfig[];
  idea_complexity_levels: StatusConfig[];
  decision_statuses: StatusConfig[];
  agent_display_names: AgentDisplayName[];
  session_prefixes: SessionPrefixConfig;
  ollama_defaults: OllamaDefaults;
  ssh_terminal?: SshTerminalConfig;
}

/** Helper type for creating lookup maps from status arrays */
export type StatusConfigMap<T extends string = string> = Record<T, { label: string; color: string }>;
