import { useCallback, useMemo } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import { useToastStore } from '../store/toastStore';
import { useCronOutputStore } from '../store/cronOutputStore';
import type { ScheduledAgentInfo, ScheduledAgentConfig, ScheduledAgentGroup } from '@/types';
import { createDefaultScheduledAgentConfig } from '@/types/scheduler';

export interface GroupedScheduledAgents {
  grouped: Record<string, ScheduledAgentInfo[]>;
  ungrouped: ScheduledAgentInfo[];
}

export interface UseScheduledAgentsResult {
  agents: ScheduledAgentInfo[];
  groups: ScheduledAgentGroup[];
  groupedAgents: GroupedScheduledAgents;
  loading: boolean;
  hasRunningAgents: boolean;
  refreshAgents: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAll: () => void;
  createAgent: (name: string, config?: ScheduledAgentConfig | null, group?: string) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  triggerAgent: (name: string) => Promise<boolean>;
  toggleAgentEnabled: (name: string, enabled: boolean) => Promise<boolean>;
}

/**
 * Hook for managing Scheduled agents.
 *
 * Combines data fetching for agents and groups, with CRUD operations
 * and auto-polling when agents are running.
 */
export function useScheduledAgents(): UseScheduledAgentsResult {
  const { error: showError, success: showSuccess } = useToastStore();
  const { openOutput } = useCronOutputStore();

  const {
    data: agents,
    loading: agentsLoading,
    refresh: refreshAgents,
  } = useFetchData({
    fetcher: () => invoke<ScheduledAgentInfo[]>('list_scheduled_agents'),
    defaultValue: [],
    errorMessage: 'Failed to load agents',
    init: () => invoke('init_scheduler'),
  });

  const {
    data: groups,
    loading: groupsLoading,
    refresh: refreshGroups,
  } = useFetchData({
    fetcher: () => invoke<ScheduledAgentGroup[]>('list_scheduled_groups'),
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

  const groupedAgents = useMemo((): GroupedScheduledAgents => {
    const grouped: Record<string, ScheduledAgentInfo[]> = {};
    const ungrouped: ScheduledAgentInfo[] = [];

    for (const agent of agents) {
      // Use custom group if set, otherwise group by role (agent identity)
      const groupKey = agent.group || (agent.role ? `role:${agent.role}` : null);

      if (groupKey) {
        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
        }
        grouped[groupKey].push(agent);
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
    config?: ScheduledAgentConfig | null,
    group?: string
  ): Promise<boolean> => {
    if (!name.trim()) {
      showError('Agent name is required');
      return false;
    }

    const agentName = name.trim();
    const agentConfig = config || createDefaultScheduledAgentConfig(agentName, group || undefined);
    agentConfig.name = agentName;
    agentConfig.group = group || undefined;

    try {
      await invoke('create_scheduled_agent', { config: agentConfig });
      showSuccess(`Created agent: ${agentName}`);
      refreshAgents();
      return true;
    } catch (err) {
      showError(`Failed to create agent: ${err}`);
      return false;
    }
  }, [showError, showSuccess, refreshAgents]);

  const deleteAgent = useCallback(async (name: string): Promise<boolean> => {
    try {
      await invoke('delete_scheduled_agent', { name });
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
      await invoke('trigger_scheduled_agent', { name });
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
      await invoke('toggle_scheduled_agent', { name, enabled });
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
