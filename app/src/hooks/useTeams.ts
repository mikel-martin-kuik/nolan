/**
 * React Query hooks for team data
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (teams, configs)
 * - Zustand: UI-only state (current team selection)
 * - Context: Cross-cutting domain state (active project context)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { useToastStore } from '../store/toastStore';
import type { TeamConfig, AgentDirectoryInfo } from '../types';
import { updateAgentDescriptions } from '../types';

// Query keys for consistent cache management
export const teamKeys = {
  all: ['teams'] as const,
  list: () => [...teamKeys.all, 'list'] as const,
  configs: () => [...teamKeys.all, 'configs'] as const,
  config: (name: string) => [...teamKeys.all, 'config', name] as const,
  agentDirectories: () => ['agentDirectories'] as const,
};

/**
 * Hook to fetch the list of available team names
 */
export function useAvailableTeams() {
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: async () => {
      const teams = await invoke<string[]>('list_teams');
      return teams;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch a single team configuration
 */
export function useTeamConfig(teamName: string | null) {
  return useQuery({
    queryKey: teamKeys.config(teamName || ''),
    queryFn: async () => {
      if (!teamName) return null;

      const team = await invoke<TeamConfig>('get_team_config', { teamName });

      // Also fetch agent directories to update descriptions
      try {
        const agentInfos = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
        updateAgentDescriptions(agentInfos);
      } catch (e) {
        console.error('Failed to load agent directories for descriptions:', e);
      }

      return team;
    },
    enabled: !!teamName,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch all team configurations at once
 * Useful for dashboard views that need all teams
 */
export function useAllTeamConfigs() {
  const { data: availableTeams = [] } = useAvailableTeams();

  return useQuery({
    queryKey: teamKeys.configs(),
    queryFn: async () => {
      const configs = new Map<string, TeamConfig>();

      for (const teamName of availableTeams) {
        try {
          const team = await invoke<TeamConfig>('get_team_config', { teamName });
          configs.set(teamName, team);
        } catch (e) {
          console.error(`Failed to load team config for ${teamName}:`, e);
        }
      }

      return configs;
    },
    enabled: availableTeams.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for team deletion mutation
 */
export function useDeleteTeam() {
  const queryClient = useQueryClient();
  const { error: showError } = useToastStore();

  return useMutation({
    mutationFn: async (teamName: string) => {
      await invoke('delete_team', { teamName });
      return teamName;
    },
    onSuccess: (_teamName) => {
      // Invalidate team queries to refetch
      queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
    onError: (error, teamName) => {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to delete team ${teamName}: ${message}`);
    },
  });
}

// Result type for useTeams hook
export interface UseTeamsResult {
  availableTeams: string[];
  teamConfigs: Map<string, TeamConfig>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  deleteTeam: (name: string) => Promise<void>;
  isDeleting: boolean;
}

/**
 * Combined hook for team data - provides backward-compatible interface
 * for components migrating from useTeamStore
 */
export function useTeams(): UseTeamsResult {
  const { data: availableTeams = [], isLoading: teamsLoading, error: teamsError, refetch: refetchTeams } = useAvailableTeams();
  const { data: teamConfigs = new Map(), isLoading: configsLoading, refetch: refetchConfigs } = useAllTeamConfigs();
  const deleteTeamMutation = useDeleteTeam();

  return {
    availableTeams,
    teamConfigs,
    isLoading: teamsLoading || configsLoading,
    error: teamsError as Error | null,
    refetch: () => {
      refetchTeams();
      refetchConfigs();
    },
    deleteTeam: async (name: string) => {
      await deleteTeamMutation.mutateAsync(name);
    },
    isDeleting: deleteTeamMutation.isPending,
  };
}
