import { create } from 'zustand';

interface ChatViewState {
  // Currently selected agent session for chat
  activeSession: string | null;

  // Actions
  setActiveChat: (session: string | null) => void;
  clearActiveChat: () => void;
}

export const useChatViewStore = create<ChatViewState>((set) => ({
  activeSession: null,

  setActiveChat: (session) => set({ activeSession: session }),

  clearActiveChat: () => set({ activeSession: null }),
}));
