import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AgentStatusList, AgentName } from '../types';
import { useToastStore } from './toastStore';

interface AgentStore {
  // State
  coreAgents: AgentStatusList['core'];
  spawnedSessions: AgentStatusList['spawned'];
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  unlistenFn: (() => void) | null;

  // Actions
  updateStatus: () => Promise<void>;
  launchCore: () => Promise<void>;
  killCore: () => Promise<void>;
  spawnAgent: (agent: AgentName, force?: boolean) => Promise<void>;
  restartCoreAgent: (agent: AgentName) => Promise<void>;
  killInstance: (session: string) => Promise<void>;
  killAllInstances: (agent: AgentName) => Promise<void>;
  clearError: () => void;
  setupEventListeners: () => Promise<void>;
  cleanup: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  coreAgents: [],
  spawnedSessions: [],
  loading: false,
  error: null,
  lastUpdate: 0,
  unlistenFn: null,

  // Fetch and update agent status
  updateStatus: async () => {
    try {
      // Don't set loading state for background refreshes
      // Only user actions (launch, kill, spawn) should show loading
      const status = await invoke<AgentStatusList>('get_agent_status');

      set({
        coreAgents: status.core,
        spawnedSessions: status.spawned,
        lastUpdate: Date.now(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  // Launch core team
  launchCore: async () => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('launch_core');

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success('Core team launched successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to launch core team: ${message}`);
    }
  },

  // Kill core team (requires user confirmation in component)
  killCore: async () => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_core');

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success('Core team terminated');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill core team: ${message}`);
    }
  },

  // Spawn a new agent instance
  spawnAgent: async (agent: AgentName, force = false) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('spawn_agent', { agent, force });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Spawned ${agent} instance`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to spawn ${agent}: ${message}`);
    }
  },

  // Restart a core agent (creates unnumbered session)
  restartCoreAgent: async (agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('restart_core_agent', { agent });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Restarted ${agent}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to restart ${agent}: ${message}`);
    }
  },

  // Kill a specific instance
  killInstance: async (session: string) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_instance', { session });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Killed session: ${session}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill ${session}: ${message}`);
    }
  },

  // Kill all instances of an agent
  killAllInstances: async (agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      const result = await invoke<string>('kill_all_instances', { agent });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill ${agent} instances: ${message}`);
    }
  },

  // Clear error message
  clearError: () => set({ error: null }),

  // Setup event listeners for real-time updates
  setupEventListeners: async () => {
    const state = get();

    // If already listening, don't create duplicate listeners
    if (state.unlistenFn) {
      return;
    }

    // Listen for agent status changes from backend
    const unlisten = await listen<AgentStatusList>('agent-status-changed', (event) => {
      set({
        coreAgents: event.payload.core,
        spawnedSessions: event.payload.spawned,
        lastUpdate: Date.now(),
      });
    });

    set({ unlistenFn: unlisten });
  },

  // Cleanup event listeners
  cleanup: () => {
    const state = get();
    if (state.unlistenFn) {
      state.unlistenFn();
      set({ unlistenFn: null });
    }
  },
}));
