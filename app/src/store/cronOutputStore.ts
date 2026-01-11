import { create } from 'zustand';

interface CronOutputState {
  selectedAgent: string | null;
  selectedRunId: string | null;
  openOutput: (agentName: string, runId?: string) => void;
  closeOutput: () => void;
}

/**
 * Cron agent output panel state store
 *
 * Manages the state for the cron agent output panel displayed on the cron detail page
 */
export const useCronOutputStore = create<CronOutputState>((set) => ({
  selectedAgent: null,
  selectedRunId: null,
  openOutput: (agentName: string, runId?: string) => {
    set({ selectedAgent: agentName, selectedRunId: runId || null });
  },
  closeOutput: () => {
    set({ selectedAgent: null, selectedRunId: null });
  },
}));
