import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TeamConfig, AgentDirectoryInfo } from '../types';
import { updateAgentDescriptions } from '../types';

interface TeamState {
  currentTeam: TeamConfig | null;
  availableTeams: string[];
  teamConfigs: Map<string, TeamConfig>;
  loadTeam: (name: string) => Promise<void>;
  loadAvailableTeams: () => Promise<void>;
  loadAllTeams: () => Promise<void>;
  deleteTeam: (name: string) => Promise<void>;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  currentTeam: null,
  availableTeams: [],
  teamConfigs: new Map(),

  loadTeam: async (name: string) => {
    const team = await invoke<TeamConfig>('get_team_config', { teamName: name });
    set({ currentTeam: team });

    // Fetch agent directories to get roles from agent.json files
    try {
      const agentInfos = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      updateAgentDescriptions(agentInfos);
    } catch (e) {
      console.error('Failed to load agent directories for descriptions:', e);
    }
  },

  loadAvailableTeams: async () => {
    const teams = await invoke<string[]>('list_teams');
    set({ availableTeams: teams });
  },

  loadAllTeams: async () => {
    const { availableTeams } = get();
    const configs = new Map<string, TeamConfig>();

    for (const teamName of availableTeams) {
      try {
        const team = await invoke<TeamConfig>('get_team_config', { teamName });
        configs.set(teamName, team);
      } catch (e) {
        console.error(`Failed to load team config for ${teamName}:`, e);
      }
    }

    set({ teamConfigs: configs });
  },

  deleteTeam: async (name: string) => {
    await invoke('delete_team', { teamName: name });
  },
}));
