import { create } from 'zustand';

export type ChatMode = 'teams' | 'agents';

interface ChatViewState {
  // Chat mode: team group chats vs individual free agents
  chatMode: ChatMode;

  // Currently selected team for group chat
  activeTeam: string | null;

  // Currently selected free agent session for individual chat
  activeFreeAgent: string | null;

  // Optional filter to show only one agent's messages within team chat
  agentFilter: string | null;

  // Actions
  setChatMode: (mode: ChatMode) => void;
  setActiveTeam: (team: string | null) => void;
  setActiveFreeAgent: (session: string | null) => void;
  setAgentFilter: (agent: string | null) => void;
  clearActiveChat: () => void;
}

export const useChatViewStore = create<ChatViewState>((set) => ({
  chatMode: 'teams',
  activeTeam: null,
  activeFreeAgent: null,
  agentFilter: null,

  setChatMode: (mode) => set({ chatMode: mode }),

  setActiveTeam: (team) => set({ activeTeam: team, agentFilter: null }),

  setActiveFreeAgent: (session) => set({ activeFreeAgent: session }),

  setAgentFilter: (agent) => set({ agentFilter: agent }),

  clearActiveChat: () => set({ activeTeam: null, activeFreeAgent: null, agentFilter: null }),
}));
