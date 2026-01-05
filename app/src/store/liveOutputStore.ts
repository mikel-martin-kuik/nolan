import { create } from 'zustand';
import { HistoryEntry } from '../types';

// Maximum entries to keep per agent
const MAX_ENTRIES_PER_AGENT = 50;

// Activity threshold in milliseconds (5 seconds)
const ACTIVITY_THRESHOLD_MS = 5000;

export interface AgentLiveOutput {
  entries: HistoryEntry[];
  lastUpdate: number;
  isActive: boolean;
}

interface LiveOutputStore {
  // Per-agent output buffers keyed by tmux_session
  agentOutputs: Record<string, AgentLiveOutput>;

  // Track which agent cards are expanded
  expandedAgents: Set<string>;

  // Global auto-scroll setting
  autoScroll: boolean;

  // Actions
  addEntry: (entry: HistoryEntry) => void;
  getOutputForSession: (tmuxSession: string) => AgentLiveOutput | undefined;
  toggleExpanded: (tmuxSession: string) => void;
  setExpanded: (tmuxSession: string, expanded: boolean) => void;
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
  // Set up activity decay timer
  let decayInterval: ReturnType<typeof setInterval> | null = null;

  const startDecayTimer = () => {
    if (decayInterval) return;

    decayInterval = setInterval(() => {
      const now = Date.now();
      const state = get();
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

  // Start the decay timer immediately
  startDecayTimer();

  return {
    agentOutputs: {},
    expandedAgents: new Set(),
    autoScroll: true,

    addEntry: (entry) => {
      const session = entry.tmux_session;
      if (!session) return;

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
        const newExpanded = new Set(state.expandedAgents);
        if (newExpanded.has(tmuxSession)) {
          newExpanded.delete(tmuxSession);
        } else {
          newExpanded.add(tmuxSession);
        }
        return { expandedAgents: newExpanded };
      });
    },

    setExpanded: (tmuxSession, expanded) => {
      set((state) => {
        const newExpanded = new Set(state.expandedAgents);
        if (expanded) {
          newExpanded.add(tmuxSession);
        } else {
          newExpanded.delete(tmuxSession);
        }
        return { expandedAgents: newExpanded };
      });
    },

    clearSession: (tmuxSession) => {
      set((state) => {
        const newOutputs = { ...state.agentOutputs };
        delete newOutputs[tmuxSession];
        return { agentOutputs: newOutputs };
      });
    },

    clearAll: () => {
      set({ agentOutputs: {}, expandedAgents: new Set() });
    },

    toggleAutoScroll: () => {
      set((state) => ({ autoScroll: !state.autoScroll }));
    },

    getActiveSessions: () => {
      return Object.keys(get().agentOutputs);
    },
  };
});
