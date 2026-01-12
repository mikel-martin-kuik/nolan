import { useMemo } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import type { CronAgentInfo } from '@/types';

export interface UseEventAgentsResult {
  agents: CronAgentInfo[];
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
    fetcher: () => invoke<CronAgentInfo[]>('list_cron_agents'),
    defaultValue: [],
    errorMessage: 'Failed to load agents',
    init: () => invoke('init_cronos'),
  });

  // Filter to only event agents
  const agents = useMemo(
    () => allAgents.filter(a => a.agent_type === 'event'),
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
