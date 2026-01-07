import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TeamConfig } from '../types';
import { updateAgentDescriptions, updateAgentColors } from '../types';

interface TeamState {
  currentTeam: TeamConfig | null;
  availableTeams: string[];
  loadTeam: (name: string) => Promise<void>;
  loadAvailableTeams: () => Promise<void>;
}

export const useTeamStore = create<TeamState>((set) => ({
  currentTeam: null,
  availableTeams: [],

  loadTeam: async (name: string) => {
    const team = await invoke<TeamConfig>('get_team_config', { teamName: name });
    set({ currentTeam: team });

    // Update global agent descriptions and colors
    updateAgentDescriptions(team);
    updateAgentColors(team);
  },

  loadAvailableTeams: async () => {
    const teams = await invoke<string[]>('list_teams');
    set({ availableTeams: teams });
  },
}));
