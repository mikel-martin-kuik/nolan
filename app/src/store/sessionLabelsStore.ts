import { create } from 'zustand';
import { invoke, isBrowserMode } from '@/lib/api';

interface SessionLabelsStore {
  labels: Record<string, string>;
  isLoading: boolean;

  // Actions
  fetchLabels: () => Promise<void>;
  setLabel: (session: string, label: string) => Promise<void>;
  clearLabel: (session: string) => Promise<void>;
  getLabel: (session: string) => string | undefined;
}

export const useSessionLabelsStore = create<SessionLabelsStore>((set, get) => ({
  labels: {},
  isLoading: false,

  fetchLabels: async () => {
    set({ isLoading: true });
    try {
      const response = await invoke<{ labels: Record<string, string> }>('list_session_labels');
      set({ labels: response.labels, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch session labels:', error);
      set({ isLoading: false });
    }
  },

  setLabel: async (session: string, label: string) => {
    try {
      await invoke('set_session_label', { session, label });
      // Optimistically update local state
      set((state) => ({
        labels: { ...state.labels, [session]: label }
      }));
    } catch (error) {
      console.error('Failed to set session label:', error);
      throw error;
    }
  },

  clearLabel: async (session: string) => {
    try {
      await invoke('clear_session_label', { session });
      // Optimistically update local state
      set((state) => {
        const { [session]: _, ...rest } = state.labels;
        return { labels: rest };
      });
    } catch (error) {
      console.error('Failed to clear session label:', error);
      throw error;
    }
  },

  getLabel: (session: string) => {
    return get().labels[session];
  },
}));

// Listen for label change events from backend
let unlistenFn: (() => void) | null = null;

export async function initSessionLabelsListener() {
  if (unlistenFn) return;

  // In browser mode, events are not supported for this feature yet
  // The optimistic updates in the store are sufficient
  if (isBrowserMode()) {
    return;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    unlistenFn = await listen<{ session: string; label: string | null }>(
      'session-label-changed',
      (event) => {
        const { session, label } = event.payload;
        useSessionLabelsStore.setState((state) => {
          if (label) {
            return { labels: { ...state.labels, [session]: label } };
          } else {
            const { [session]: _, ...rest } = state.labels;
            return { labels: rest };
          }
        });
      }
    );
  } catch (error) {
    console.error('Failed to initialize session labels listener:', error);
  }
}

export function cleanupSessionLabelsListener() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}
