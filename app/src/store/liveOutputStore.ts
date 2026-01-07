import { create } from 'zustand';
import { HistoryEntry } from '../types';

// Maximum entries to keep per agent
const MAX_ENTRIES_PER_AGENT = 100;

// Activity threshold in milliseconds (12 seconds)
// Longer threshold to avoid flickering when model outputs then keeps thinking
const ACTIVITY_THRESHOLD_MS = 12000;

export interface AgentLiveOutput {
  entries: HistoryEntry[];
  lastUpdate: number;
  isActive: boolean;
}

interface LiveOutputStore {
  // Per-agent output buffers keyed by tmux_session
  agentOutputs: Record<string, AgentLiveOutput>;

  // Track which agent cards are expanded (using Record for proper Zustand equality)
  expandedAgents: Record<string, boolean>;

  // Selected agent session for modal view (null = modal closed)
  selectedSession: string | null;

  // Global auto-scroll setting
  autoScroll: boolean;

  // Actions
  addEntry: (entry: HistoryEntry) => void;
  getOutputForSession: (tmuxSession: string) => AgentLiveOutput | undefined;
  isExpanded: (tmuxSession: string) => boolean;
  toggleExpanded: (tmuxSession: string) => void;
  setExpanded: (tmuxSession: string, expanded: boolean) => void;
  openModal: (tmuxSession: string) => void;
  closeModal: () => void;
  clearSession: (tmuxSession: string) => void;
  clearAll: () => void;
  toggleAutoScroll: () => void;

  // Get all active sessions (for rendering)
  getActiveSessions: () => string[];
}

// Helper to create unique key for deduplication
const getEntryKey = (entry: HistoryEntry): string => {
  const messagePrefix = entry.message.slice(0, 100);
  return `${entry.timestamp}-${entry.tmux_session || 'unknown'}-${messagePrefix}`;
};

export const useLiveOutputStore = create<LiveOutputStore>((set, get) => {
  // Set up activity decay timer - only runs when there are active sessions
  let decayInterval: ReturnType<typeof setInterval> | null = null;

  const startDecayTimer = () => {
    if (decayInterval) return;

    decayInterval = setInterval(() => {
      const state = get();
      const hasActiveSessions = Object.values(state.agentOutputs).some(output => output.isActive);

      // Stop timer if no active sessions to save CPU
      if (!hasActiveSessions) {
        stopDecayTimer();
        return;
      }

      const now = Date.now();
      let hasChanges = false;
      const newOutputs = { ...state.agentOutputs };

      for (const [session, output] of Object.entries(newOutputs)) {
        if (output.isActive && now - output.lastUpdate > ACTIVITY_THRESHOLD_MS) {
          newOutputs[session] = { ...output, isActive: false };
          hasChanges = true;
        }
      }

      if (hasChanges) {
        set({ agentOutputs: newOutputs });
      }
    }, 1000);
  };

  const stopDecayTimer = () => {
    if (decayInterval) {
      clearInterval(decayInterval);
      decayInterval = null;
    }
  };

  return {
    agentOutputs: {},
    expandedAgents: {},
    selectedSession: null,
    autoScroll: true,

    isExpanded: (tmuxSession) => {
      return get().expandedAgents[tmuxSession] === true;
    },

    addEntry: (entry) => {
      const session = entry.tmux_session;
      if (!session) return;

      // Start decay timer when first entry arrives
      startDecayTimer();

      set((state) => {
        const existing = state.agentOutputs[session] || {
          entries: [],
          lastUpdate: 0,
          isActive: false,
        };

        // Check for duplicates using a simple key
        const newKey = getEntryKey(entry);
        const isDuplicate = existing.entries.some(
          (e) => getEntryKey(e) === newKey
        );

        if (isDuplicate) {
          return state;
        }

        // Add entry with LRU eviction
        const newEntries = [...existing.entries, entry];
        if (newEntries.length > MAX_ENTRIES_PER_AGENT) {
          newEntries.splice(0, newEntries.length - MAX_ENTRIES_PER_AGENT);
        }

        return {
          agentOutputs: {
            ...state.agentOutputs,
            [session]: {
              entries: newEntries,
              lastUpdate: Date.now(),
              isActive: true,
            },
          },
        };
      });
    },

    getOutputForSession: (tmuxSession) => {
      return get().agentOutputs[tmuxSession];
    },

    toggleExpanded: (tmuxSession) => {
      set((state) => {
        const currentValue = state.expandedAgents[tmuxSession] === true;
        return {
          expandedAgents: {
            ...state.expandedAgents,
            [tmuxSession]: !currentValue,
          },
        };
      });
    },

    setExpanded: (tmuxSession, expanded) => {
      set((state) => ({
        expandedAgents: {
          ...state.expandedAgents,
          [tmuxSession]: expanded,
        },
      }));
    },

    openModal: (tmuxSession) => {
      set({ selectedSession: tmuxSession });
    },

    closeModal: () => {
      set({ selectedSession: null });
    },

    clearSession: (tmuxSession) => {
      set((state) => {
        const existing = state.agentOutputs[tmuxSession];
        if (!existing || existing.entries.length === 0) {
          return state;
        }

        // Keep only the last entry
        const lastEntry = existing.entries[existing.entries.length - 1];
        return {
          agentOutputs: {
            ...state.agentOutputs,
            [tmuxSession]: {
              ...existing,
              entries: [lastEntry],
            },
          },
        };
      });
    },

    clearAll: () => {
      stopDecayTimer();
      set({ agentOutputs: {}, expandedAgents: {}, selectedSession: null });
    },

    toggleAutoScroll: () => {
      set((state) => ({ autoScroll: !state.autoScroll }));
    },

    getActiveSessions: () => {
      return Object.keys(get().agentOutputs);
    },
  };
});
