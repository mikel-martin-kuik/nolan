import { create } from 'zustand';
import { HistoryEntry } from '../types';

interface HistoryStore {
  entries: HistoryEntry[];
  maxEntries: number;
  autoScroll: boolean;
  addEntry: (entry: HistoryEntry) => void;
  clearEntries: () => void;
  toggleAutoScroll: () => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  entries: [],
  maxEntries: 1000, // Limit to last 1000 entries for memory management
  autoScroll: true,

  addEntry: (entry) =>
    set((state) => {
      const newEntries = [...state.entries, entry];
      // Keep only the last maxEntries entries
      if (newEntries.length > state.maxEntries) {
        return { entries: newEntries.slice(-state.maxEntries) };
      }
      return { entries: newEntries };
    }),

  clearEntries: () => set({ entries: [] }),

  toggleAutoScroll: () => set((state) => ({ autoScroll: !state.autoScroll })),
}));
