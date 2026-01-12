import { useCallback, useMemo } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import { useToastStore } from '../store/toastStore';
import { useCronOutputStore } from '../store/cronOutputStore';
import type { CronAgentInfo } from '@/types';

export interface UsePredefinedAgentsResult {
  agents: CronAgentInfo[];
  loading: boolean;
  hasRunningAgents: boolean;
  refreshAgents: () => Promise<void>;
  triggerAgent: (name: string) => Promise<boolean>;
}

/**
 * Hook for managing Predefined (on-demand) agents.
 *
 * Filters agents by type and provides trigger functionality.
 */
export function usePredefinedAgents(): UsePredefinedAgentsResult {
  const { error: showError, success: showSuccess } = useToastStore();
  const { openOutput } = useCronOutputStore();

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

  // Filter to only predefined agents
  const agents = useMemo(
    () => allAgents.filter(a => a.agent_type === 'predefined'),
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

  const triggerAgent = useCallback(async (name: string): Promise<boolean> => {
    try {
      await invoke('trigger_predefined_agent', { name });
      showSuccess(`Triggered ${name.replace('pred-', '')}`);
      openOutput(name);
      setTimeout(refreshAgents, 500);
      return true;
    } catch (err) {
      showError(`Failed to trigger agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents, openOutput]);

  return {
    agents,
    loading,
    hasRunningAgents,
    refreshAgents,
    triggerAgent,
  };
}
