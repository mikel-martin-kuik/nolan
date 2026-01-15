import { useMemo } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import type { ScheduledAgentInfo } from '@/types';

export interface UseEventAgentsResult {
  agents: ScheduledAgentInfo[];
  loading: boolean;
  hasRunningAgents: boolean;
  refreshAgents: () => Promise<void>;
}

/**
 * Hook for managing Event-driven agents.
 *
 * Filters agents by type. Event agents are triggered automatically
 * by the backend event bus, so no manual trigger is exposed.
 */
export function useEventAgents(): UseEventAgentsResult {
  const {
    data: allAgents,
    loading,
    refresh: refreshAgents,
  } = useFetchData({
    fetcher: () => invoke<ScheduledAgentInfo[]>('list_scheduled_agents'),
    defaultValue: [],
    errorMessage: 'Failed to load agents',
    init: () => invoke('init_scheduler'),
  });

  // Filter to agents with event triggers
  const agents = useMemo(
    () => allAgents.filter(a => a.event_trigger != null),
    [allAgents]
  );

  const hasRunningAgents = useMemo(
    () => agents.some(a => a.is_running),
    [agents]
  );

  // Poll when agents are running
  usePollingEffect({
    interval: 3000,
    enabled: hasRunningAgents,
    callback: refreshAgents,
  });

  return {
    agents,
    loading,
    hasRunningAgents,
    refreshAgents,
  };
}
