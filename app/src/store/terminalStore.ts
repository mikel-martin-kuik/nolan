import { create } from 'zustand';

interface TerminalState {
  selectedSession: string | null;
  agentName: string | null;
  openModal: (session: string, agentName: string) => void;
  closeModal: () => void;
}

/**
 * Terminal modal state store
 *
 * Manages the state for the full-screen terminal modal
 */
export const useTerminalStore = create<TerminalState>((set) => ({
  selectedSession: null,
  agentName: null,
  openModal: (session: string, agentName: string) => {
    set({ selectedSession: session, agentName });
  },
  closeModal: () => {
    set({ selectedSession: null, agentName: null });
  },
}));
