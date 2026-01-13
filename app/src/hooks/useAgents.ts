/**
 * React Query hooks for agent status data
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (agent status)
 * - Zustand: UI-only state (loading states for mutations)
 * - Event-driven: Real-time updates via WebSocket/Tauri events
 *
 * Key features:
 * - Event-driven cache invalidation (primary)
 * - 60s polling fallback for missed events
 * - Deduplication and caching
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { listen } from '@/lib/events';
import { useToastStore } from '../store/toastStore';
import type { AgentStatusList, AgentName, ClaudeModel } from '../types';

// Query keys for consistent cache management
export const agentKeys = {
  all: ['agents'] as const,
  status: () => [...agentKeys.all, 'status'] as const,
};

// Timeout wrapper to prevent UI hangs
async function invokeWithTimeout<T>(
  cmd: string,
  args: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Backend timeout after ${timeoutMs/1000}s`)), timeoutMs);
  });
  return Promise.race([invoke<T>(cmd, args), timeoutPromise]);
}

/**
 * Hook to fetch and subscribe to agent status
 *
 * Uses event-driven updates with 60s polling fallback
 */
export function useAgentStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: agentKeys.status(),
    queryFn: async () => {
      const status = await invoke<AgentStatusList>('get_agent_status');

      if (!status || typeof status !== 'object') {
        throw new Error('Invalid status response from server');
      }

      return {
        teamAgents: status.team ?? [],
        freeAgents: status.free ?? [],
      };
    },
    staleTime: 1000 * 30, // 30 seconds - events will update more frequently
    refetchInterval: 60000, // 60s polling fallback for missed events
  });

  // Subscribe to real-time status events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<AgentStatusList>('agent-status-changed', (event) => {
        const payload = event.payload;
        if (!payload || typeof payload !== 'object') return;

        // Update React Query cache directly with event data
        queryClient.setQueryData(agentKeys.status(), {
          teamAgents: payload.team ?? [],
          freeAgents: payload.free ?? [],
        });
      });
    };

    setup().catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [queryClient]);

  return query;
}

/**
 * Hook for launching a team
 */
export function useLaunchTeam() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (params: {
      teamName: string;
      projectName: string;
      initialPrompt?: string;
      updatedOriginalPrompt?: string;
      followupPrompt?: string;
    }) => {
      await invokeWithTimeout<string>('launch_team', {
        teamName: params.teamName,
        projectName: params.projectName,
        initialPrompt: params.initialPrompt,
        updatedOriginalPrompt: params.updatedOriginalPrompt,
        followupPrompt: params.followupPrompt,
      }, 60000);
      return params.teamName;
    },
    onSuccess: (teamName) => {
      success(`Team ${teamName} launched`);
      // Status will update via event, but invalidate as fallback
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, params) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to launch team ${params.teamName}: ${message}`);
    },
  });
}

/**
 * Hook for killing a team
 */
export function useKillTeam() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (teamName: string) => {
      await invoke<string>('kill_team', { teamName });
      return teamName;
    },
    onSuccess: (teamName) => {
      success(`Team ${teamName} terminated`);
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, teamName) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to kill team ${teamName}: ${message}`);
    },
  });
}

/**
 * Hook for spawning a new agent instance
 */
export function useSpawnAgent() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (params: {
      teamName: string;
      agent: AgentName;
      force?: boolean;
      model?: ClaudeModel;
      chrome?: boolean;
      worktreePath?: string;
    }) => {
      await invoke<string>('spawn_agent', {
        teamName: params.teamName,
        agent: params.agent,
        force: params.force ?? false,
        model: params.model,
        chrome: params.chrome,
        worktreePath: params.worktreePath,
      });
      return params;
    },
    onSuccess: (params) => {
      success(`Spawned ${params.agent} instance in team ${params.teamName}`);
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, params) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to spawn ${params.agent}: ${message}`);
    },
  });
}

/**
 * Hook for starting a team agent
 */
export function useStartAgent() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (params: { teamName: string; agent: AgentName }) => {
      await invoke<string>('start_agent', {
        teamName: params.teamName,
        agent: params.agent,
      });
      return params;
    },
    onSuccess: (params) => {
      success(`Started ${params.agent} in team ${params.teamName}`);
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, params) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to start ${params.agent}: ${message}`);
    },
  });
}

/**
 * Hook for killing a specific agent instance
 */
export function useKillInstance() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (session: string) => {
      await invoke<string>('kill_instance', { session });
      return session;
    },
    onSuccess: (session) => {
      success(`Killed session: ${session}`);
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, session) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to kill ${session}: ${message}`);
    },
  });
}

/**
 * Hook for killing all instances of an agent
 */
export function useKillAllInstances() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (params: { teamName: string; agent: AgentName }) => {
      const result = await invoke<string>('kill_all_instances', {
        teamName: params.teamName,
        agent: params.agent,
      });
      return result;
    },
    onSuccess: (result) => {
      success(result);
      queryClient.invalidateQueries({ queryKey: agentKeys.status() });
    },
    onError: (error, params) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to kill ${params.agent} instances: ${message}`);
    },
  });
}

// Result type for useAgents hook
export interface UseAgentsResult {
  teamAgents: AgentStatusList['team'];
  freeAgents: AgentStatusList['free'];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  // Mutations
  launchTeam: ReturnType<typeof useLaunchTeam>;
  killTeam: ReturnType<typeof useKillTeam>;
  spawnAgent: ReturnType<typeof useSpawnAgent>;
  startAgent: ReturnType<typeof useStartAgent>;
  killInstance: ReturnType<typeof useKillInstance>;
  killAllInstances: ReturnType<typeof useKillAllInstances>;
}

/**
 * Combined hook for agent data and mutations
 * Provides backward-compatible interface for components migrating from useAgentStore
 */
export function useAgents(): UseAgentsResult {
  const { data, isLoading, error, refetch } = useAgentStatus();
  const launchTeam = useLaunchTeam();
  const killTeam = useKillTeam();
  const spawnAgent = useSpawnAgent();
  const startAgent = useStartAgent();
  const killInstance = useKillInstance();
  const killAllInstances = useKillAllInstances();

  return {
    teamAgents: data?.teamAgents ?? [],
    freeAgents: data?.freeAgents ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
    launchTeam,
    killTeam,
    spawnAgent,
    startAgent,
    killInstance,
    killAllInstances,
  };
}
