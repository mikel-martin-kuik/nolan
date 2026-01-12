/**
 * Agent Store - UI-only state
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (see hooks/useAgents.ts)
 * - Zustand: UI-only state (THIS - loading states, error messages)
 *
 * MIGRATION NOTE: Components should migrate to:
 * - useAgents() or useAgentStatus() for server data
 * - Mutation hooks (useLaunchTeam, useKillTeam, etc.) for actions
 * - This store is kept for backward compatibility during migration
 *
 * @deprecated Use useAgents() and related mutation hooks instead
 */
import { create } from 'zustand';
import { invoke } from '@/lib/api';
import { listen } from '@/lib/events';
import type { AgentStatusList, AgentName, ClaudeModel } from '../types';
import { useToastStore } from './toastStore';

// Helper to wrap invoke with a timeout to prevent UI hangs from backend issues
async function invokeWithTimeout<T>(
  cmd: string,
  args: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Backend timeout after ${timeoutMs/1000}s - check if tmux is responsive`)), timeoutMs);
  });
  return Promise.race([invoke<T>(cmd, args), timeoutPromise]);
}

interface AgentStore {
  // UI State
  loading: boolean;
  error: string | null;

  // Legacy server state (deprecated - use React Query hooks instead)
  teamAgents: AgentStatusList['team'];
  freeAgents: AgentStatusList['free'];
  lastUpdate: number;
  unlistenFn: (() => void) | null;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // UI Actions
  clearError: () => void;
  setLoading: (loading: boolean) => void;

  // Legacy actions (deprecated - use React Query hooks instead)
  updateStatus: () => Promise<void>;
  launchTeam: (
    teamName: string,
    projectName: string,
    initialPrompt?: string,
    updatedOriginalPrompt?: string,
    followupPrompt?: string
  ) => Promise<void>;
  killTeam: (teamName: string) => Promise<void>;
  spawnAgent: (teamName: string, agent: AgentName, force?: boolean, model?: ClaudeModel, chrome?: boolean) => Promise<void>;
  startAgent: (teamName: string, agent: AgentName) => Promise<void>;
  killInstance: (session: string) => Promise<void>;
  killAllInstances: (teamName: string, agent: AgentName) => Promise<void>;
  setupEventListeners: () => Promise<void>;
  cleanup: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // UI state - PRIMARY
  loading: false,
  error: null,

  // Legacy server state
  teamAgents: [],
  freeAgents: [],
  lastUpdate: 0,
  unlistenFn: null,
  pollIntervalId: null,

  // UI Actions
  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ loading }),

  // Legacy: Fetch and update agent status
  updateStatus: async () => {
    try {
      const status = await invoke<AgentStatusList>('get_agent_status');

      if (!status || typeof status !== 'object') {
        throw new Error('Invalid status response from server');
      }

      set({
        teamAgents: status.team ?? [],
        freeAgents: status.free ?? [],
        lastUpdate: Date.now(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  // Legacy: Launch team with project context
  launchTeam: async (
    teamName: string,
    projectName: string,
    initialPrompt?: string,
    updatedOriginalPrompt?: string,
    followupPrompt?: string
  ) => {
    try {
      set({ loading: true, error: null });

      await invokeWithTimeout<string>('launch_team', {
        teamName,
        projectName,
        initialPrompt,
        updatedOriginalPrompt,
        followupPrompt,
      }, 60000);

      set({ loading: false });
      useToastStore.getState().success(`Team ${teamName} launched for ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to launch team ${teamName}: ${message}`);
    }
  },

  // Legacy: Kill team
  killTeam: async (teamName: string) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_team', { teamName });

      set({ loading: false });
      useToastStore.getState().success(`Team ${teamName} terminated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill team ${teamName}: ${message}`);
    }
  },

  // Legacy: Spawn a new agent instance
  spawnAgent: async (teamName: string, agent: AgentName, force = false, model?: ClaudeModel, chrome?: boolean) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('spawn_agent', { teamName, agent, force, model, chrome });

      set({ loading: false });
      useToastStore.getState().success(`Spawned ${agent} instance in team ${teamName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to spawn ${agent}: ${message}`);
    }
  },

  // Legacy: Start a team agent
  startAgent: async (teamName: string, agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('start_agent', { teamName, agent });

      set({ loading: false });
      useToastStore.getState().success(`Started ${agent} in team ${teamName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to start ${agent}: ${message}`);
    }
  },

  // Legacy: Kill a specific instance
  killInstance: async (session: string) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_instance', { session });

      set({ loading: false });
      useToastStore.getState().success(`Killed session: ${session}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill ${session}: ${message}`);
    }
  },

  // Legacy: Kill all instances of an agent
  killAllInstances: async (teamName: string, agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      const result = await invoke<string>('kill_all_instances', { teamName, agent });

      set({ loading: false });
      useToastStore.getState().success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill ${agent} instances: ${message}`);
    }
  },

  // Legacy: Setup event listeners for real-time updates
  setupEventListeners: async () => {
    const state = get();

    if (state.unlistenFn || state.pollIntervalId) {
      return;
    }

    const unlisten = await listen<AgentStatusList>('agent-status-changed', (event) => {
      const payload = event.payload;
      if (!payload || typeof payload !== 'object') return;

      set({
        teamAgents: payload.team ?? [],
        freeAgents: payload.free ?? [],
        lastUpdate: Date.now(),
      });
    });

    set({ unlistenFn: unlisten });
  },

  // Legacy: Cleanup event listeners and polling
  cleanup: () => {
    const state = get();
    if (state.unlistenFn) {
      state.unlistenFn();
      set({ unlistenFn: null });
    }
    if (state.pollIntervalId) {
      clearInterval(state.pollIntervalId);
      set({ pollIntervalId: null });
    }
  },
}));
