/**
 * Team Store - UI-only state
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (see hooks/useTeams.ts)
 * - Zustand: UI-only state (THIS - current team name selection)
 * - Context: Cross-cutting domain state (see contexts/TeamContext.tsx)
 *
 * MIGRATION NOTE: Components should migrate to:
 * - useTeams() hook for availableTeams and teamConfigs (server state)
 * - useTeamContext() for current team selection (domain state)
 * - This store is kept for backward compatibility during migration
 *
 * @deprecated Use useTeams() and useTeamContext() instead
 */
import { create } from 'zustand';
import { invoke } from '@/lib/api';
import type { TeamConfig, AgentDirectoryInfo } from '../types';
import { updateAgentDescriptions } from '../types';
import { useToastStore } from './toastStore';

interface TeamState {
  // UI state - current selection
  currentTeamName: string;

  // Legacy server state (deprecated - use React Query hooks instead)
  currentTeam: TeamConfig | null;
  availableTeams: string[];
  teamConfigs: Map<string, TeamConfig>;
  error: string | null;

  // Actions
  setCurrentTeamName: (name: string) => void;

  // Legacy actions (deprecated - use React Query hooks instead)
  loadTeam: (name: string) => Promise<void>;
  loadAvailableTeams: () => Promise<void>;
  loadAllTeams: () => Promise<void>;
  deleteTeam: (name: string) => Promise<void>;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  // UI state
  currentTeamName: 'default',

  // Legacy server state
  currentTeam: null,
  availableTeams: [],
  teamConfigs: new Map(),
  error: null,

  setCurrentTeamName: (name: string) => {
    set({ currentTeamName: name });
  },

  // Legacy: kept for backward compatibility, delegates to same logic
  loadTeam: async (name: string) => {
    try {
      const team = await invoke<TeamConfig>('get_team_config', { team_name: name });
      set({ currentTeam: team, currentTeamName: name, error: null });

      // Fetch agent directories to get roles from agent.json files
      try {
        const agentInfos = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
        updateAgentDescriptions(agentInfos);
      } catch (e) {
        console.error('Failed to load agent directories for descriptions:', e);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      useToastStore.getState().error(`Failed to load team ${name}: ${message}`);
    }
  },

  loadAvailableTeams: async () => {
    try {
      const teams = await invoke<string[]>('list_teams');
      set({ availableTeams: teams, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      useToastStore.getState().error(`Failed to load teams: ${message}`);
    }
  },

  loadAllTeams: async () => {
    const { availableTeams } = get();
    const configs = new Map<string, TeamConfig>();

    for (const teamName of availableTeams) {
      try {
        const team = await invoke<TeamConfig>('get_team_config', { team_name: teamName });
        configs.set(teamName, team);
      } catch (e) {
        console.error(`Failed to load team config for ${teamName}:`, e);
      }
    }

    set({ teamConfigs: configs });
  },

  deleteTeam: async (name: string) => {
    try {
      await invoke('delete_team', { team_name: name });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      useToastStore.getState().error(`Failed to delete team ${name}: ${message}`);
      throw e; // Re-throw so callers know it failed
    }
  },
}));
