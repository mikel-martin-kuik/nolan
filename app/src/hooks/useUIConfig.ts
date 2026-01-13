/**
 * Hook for fetching and accessing UI configuration
 *
 * Fetches configuration once at app startup, caches indefinitely.
 * Provides helper functions to build lookup maps from arrays.
 */

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import type { UIConfig, StatusConfig, StatusConfigMap } from '@/types/config';

/** Query key for UI config */
export const UI_CONFIG_QUERY_KEY = ['ui-config'];

/**
 * Convert array of StatusConfig to a lookup map by value
 */
export function toStatusMap<T extends string>(configs: StatusConfig[]): StatusConfigMap<T> {
  return configs.reduce((acc, config) => {
    acc[config.value as T] = { label: config.label, color: config.color };
    return acc;
  }, {} as StatusConfigMap<T>);
}

/**
 * Main hook for accessing UI configuration
 *
 * Fetches config once and caches forever (staleTime: Infinity).
 * Use the derived hooks below for specific config sections.
 */
export function useUIConfig() {
  const { data, isLoading, error } = useQuery({
    queryKey: UI_CONFIG_QUERY_KEY,
    queryFn: () => invoke<UIConfig>('get_ui_config'),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 3,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    config: data,
    isLoading,
    error,
  };
}

/**
 * Get project status configuration as a map
 */
export function useProjectStatusConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return {
    map: toStatusMap(config.project_statuses),
    values: config.project_statuses.map((s) => s.value),
  };
}

/**
 * Get workflow status configuration as a map
 */
export function useWorkflowStatusConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return toStatusMap(config.workflow_statuses);
}

/**
 * Get feature request status configuration
 */
export function useFeatureRequestStatusConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return {
    map: toStatusMap(config.feature_request_statuses),
    values: config.feature_request_statuses.map((s) => s.value),
  };
}

/**
 * Get decision status configuration
 */
export function useDecisionStatusConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return {
    map: toStatusMap(config.decision_statuses),
    values: config.decision_statuses.map((s) => s.value),
  };
}

/**
 * Get idea status configuration (statuses, review statuses, complexity)
 */
export function useIdeaStatusConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return {
    statuses: toStatusMap(config.idea_statuses),
    reviewStatuses: toStatusMap(config.idea_review_statuses),
    complexityLevels: toStatusMap(config.idea_complexity_levels),
  };
}

/**
 * Get agent display names array
 */
export function useAgentDisplayNames() {
  const { config } = useUIConfig();
  if (!config) return null;
  return config.agent_display_names.map((n) => n.name);
}

/**
 * Get session prefixes for agent filtering
 */
export function useSessionPrefixes() {
  const { config } = useUIConfig();
  if (!config) return null;
  return config.session_prefixes;
}

/**
 * Get Ollama defaults (url, model)
 */
export function useOllamaDefaults() {
  const { config } = useUIConfig();
  if (!config) return null;
  return config.ollama_defaults;
}

/**
 * Get runtime configuration from environment variables
 * Includes: api_port, nolan_root, role_filename, team_filename
 */
export function useRuntimeConfig() {
  const { config } = useUIConfig();
  if (!config) return null;
  return config.runtime;
}
