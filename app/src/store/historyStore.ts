import { create } from 'zustand';
import { HistoryEntry } from '../types';

interface HistoryStore {
  entries: HistoryEntry[];
  seenKeys: Set<string>;
  maxEntries: number;
  autoScroll: boolean;
  addEntry: (entry: HistoryEntry) => void;
  clearEntries: () => void;
  clearOldEntries: (maxAgeMs?: number) => void;
  clearEntriesForSession: (sessionId: string) => void;
  toggleAutoScroll: () => void;
}

// Helper to create unique key for deduplication
const getEntryKey = (entry: HistoryEntry): string => {
  // Use timestamp + agent + message prefix for uniqueness
  const messagePrefix = entry.message.slice(0, 100);
  return `${entry.timestamp}-${entry.agent || 'unknown'}-${messagePrefix}`;
};

const MAX_ENTRIES = 5000; // Live UI buffer (separate from persisted JSONL files)

export const useHistoryStore = create<HistoryStore>((set) => ({
  entries: [],
  seenKeys: new Set<string>(),
  maxEntries: MAX_ENTRIES,
  autoScroll: true,

  addEntry: (entry) =>
    set((state) => {
      const key = getEntryKey(entry);

      // Skip if we've already seen this entry (deduplication)
      if (state.seenKeys.has(key)) {
        return state;
      }

      let newEntries = [...state.entries, entry];
      const newSeenKeys = new Set(state.seenKeys);
      newSeenKeys.add(key);

      // LRU eviction if over limit
      if (newEntries.length > MAX_ENTRIES) {
        const removedCount = newEntries.length - MAX_ENTRIES;
        const removedEntries = newEntries.slice(0, removedCount);

        // Clean up seenKeys for removed entries
        removedEntries.forEach((removed) => {
          const removedKey = getEntryKey(removed);
          newSeenKeys.delete(removedKey);
        });

        newEntries = newEntries.slice(removedCount);
      }

      return { entries: newEntries, seenKeys: newSeenKeys };
    }),

  clearEntries: () => set({ entries: [], seenKeys: new Set<string>() }),

  // Clear entries older than maxAgeMs (default: 1 hour)
  clearOldEntries: (maxAgeMs = 3600000) =>
    set((state) => {
      const cutoff = Date.now() - maxAgeMs;
      const filteredEntries = state.entries.filter((entry) => {
        try {
          const entryTime = new Date(entry.timestamp).getTime();
          return entryTime > cutoff;
        } catch {
          return true; // Keep entries with invalid timestamps
        }
      });

      // Rebuild seenKeys for remaining entries
      const newSeenKeys = new Set<string>();
      filteredEntries.forEach((entry) => {
        newSeenKeys.add(getEntryKey(entry));
      });

      return { entries: filteredEntries, seenKeys: newSeenKeys };
    }),

  // Clear entries for a specific session (when session is dismissed/closed)
  clearEntriesForSession: (sessionId: string) =>
    set((state) => {
      const remainingEntries = state.entries.filter(
        (entry) => entry.agent !== sessionId
      );

      // Clean up seenKeys when removing entries
      const newSeenKeys = new Set<string>();
      remainingEntries.forEach((entry) => {
        const key = getEntryKey(entry);
        if (state.seenKeys.has(key)) {
          newSeenKeys.add(key);
        }
      });

      return { entries: remainingEntries, seenKeys: newSeenKeys };
    }),

  toggleAutoScroll: () => set((state) => ({ autoScroll: !state.autoScroll })),
}));
