import { create } from 'zustand';

interface ChatViewState {
  // Currently selected team for group chat
  activeTeam: string | null;

  // Optional filter to show only one agent's messages within team chat
  agentFilter: string | null;

  // Actions
  setActiveTeam: (team: string | null) => void;
  setAgentFilter: (agent: string | null) => void;
  clearActiveChat: () => void;
}

export const useChatViewStore = create<ChatViewState>((set) => ({
  activeTeam: null,
  agentFilter: null,

  setActiveTeam: (team) => set({ activeTeam: team, agentFilter: null }),

  setAgentFilter: (agent) => set({ agentFilter: agent }),

  clearActiveChat: () => set({ activeTeam: null, agentFilter: null }),
}));
