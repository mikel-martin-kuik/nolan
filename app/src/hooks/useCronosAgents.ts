import { useCallback, useMemo } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import { useToastStore } from '../store/toastStore';
import { useCronOutputStore } from '../store/cronOutputStore';
import type { CronAgentInfo, CronAgentConfig, CronAgentGroup } from '@/types';
import { createDefaultCronAgentConfig } from '@/types/cronos';

export interface GroupedCronAgents {
  grouped: Record<string, CronAgentInfo[]>;
  ungrouped: CronAgentInfo[];
}

export interface UseCronosAgentsResult {
  agents: CronAgentInfo[];
  groups: CronAgentGroup[];
  groupedAgents: GroupedCronAgents;
  loading: boolean;
  hasRunningAgents: boolean;
  refreshAgents: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAll: () => void;
  createAgent: (name: string, config?: CronAgentConfig | null, group?: string) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  triggerAgent: (name: string) => Promise<boolean>;
  toggleAgentEnabled: (name: string, enabled: boolean) => Promise<boolean>;
}

/**
 * Hook for managing Cronos agents.
 *
 * Combines data fetching for agents and groups, with CRUD operations
 * and auto-polling when agents are running.
 */
export function useCronosAgents(): UseCronosAgentsResult {
  const { error: showError, success: showSuccess } = useToastStore();
  const { openOutput } = useCronOutputStore();

  const {
    data: agents,
    loading: agentsLoading,
    refresh: refreshAgents,
  } = useFetchData({
    fetcher: () => invoke<CronAgentInfo[]>('list_cron_agents'),
    defaultValue: [],
    errorMessage: 'Failed to load cron agents',
    init: () => invoke('init_cronos'),
  });

  const {
    data: groups,
    loading: groupsLoading,
    refresh: refreshGroups,
  } = useFetchData({
    fetcher: () => invoke<CronAgentGroup[]>('list_cron_groups'),
    defaultValue: [],
    errorMessage: 'Failed to load cron groups',
  });

  const hasRunningAgents = useMemo(
    () => agents.some(a => a.is_running),
    [agents]
  );

  usePollingEffect({
    interval: 3000,
    enabled: hasRunningAgents,
    callback: refreshAgents,
  });

  const groupedAgents = useMemo((): GroupedCronAgents => {
    const grouped: Record<string, CronAgentInfo[]> = {};
    const ungrouped: CronAgentInfo[] = [];

    for (const agent of agents) {
      if (agent.group) {
        if (!grouped[agent.group]) {
          grouped[agent.group] = [];
        }
        grouped[agent.group].push(agent);
      } else {
        ungrouped.push(agent);
      }
    }

    return { grouped, ungrouped };
  }, [agents]);

  const refreshAll = useCallback(() => {
    refreshAgents();
    refreshGroups();
  }, [refreshAgents, refreshGroups]);

  const createAgent = useCallback(async (
    name: string,
    config?: CronAgentConfig | null,
    group?: string
  ): Promise<boolean> => {
    if (!name.trim()) {
      showError('Agent name is required');
      return false;
    }

    const agentName = name.startsWith('cron-') ? name : `cron-${name}`;
    const agentConfig = config || createDefaultCronAgentConfig(agentName, group || undefined);
    agentConfig.name = agentName;
    agentConfig.group = group || undefined;

    try {
      await invoke('create_cron_agent', { config: agentConfig });
      showSuccess(`Created cron agent: ${agentName}`);
      refreshAgents();
      return true;
    } catch (err) {
      showError(`Failed to create agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents]);

  const deleteAgent = useCallback(async (name: string): Promise<boolean> => {
    try {
      await invoke('delete_cron_agent', { name });
      showSuccess(`Deleted ${name}`);
      refreshAgents();
      return true;
    } catch (err) {
      showError(`Failed to delete agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents]);

  const triggerAgent = useCallback(async (name: string): Promise<boolean> => {
    try {
      await invoke('trigger_cron_agent', { name });
      showSuccess(`Triggered ${name}`);
      openOutput(name);
      setTimeout(refreshAgents, 500);
      return true;
    } catch (err) {
      showError(`Failed to trigger agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents, openOutput]);

  const toggleAgentEnabled = useCallback(async (
    name: string,
    enabled: boolean
  ): Promise<boolean> => {
    try {
      await invoke('toggle_cron_agent', { name, enabled });
      showSuccess(`${name} ${enabled ? 'enabled' : 'disabled'}`);
      refreshAgents();
      return true;
    } catch (err) {
      showError(`Failed to toggle agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents]);

  return {
    agents,
    groups,
    groupedAgents,
    loading: agentsLoading || groupsLoading,
    hasRunningAgents,
    refreshAgents,
    refreshGroups,
    refreshAll,
    createAgent,
    deleteAgent,
    triggerAgent,
    toggleAgentEnabled,
  };
}
