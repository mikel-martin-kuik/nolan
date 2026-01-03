import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AgentStatusList, AgentName } from '../types';
import { useToastStore } from './toastStore';

interface AgentStore {
  // State
  coreAgents: AgentStatusList['core'];
  spawnedSessions: string[];
  loading: boolean;
  error: string | null;
  lastUpdate: number;

  // Actions
  updateStatus: () => Promise<void>;
  launchCore: () => Promise<void>;
  killCore: () => Promise<void>;
  spawnAgent: (agent: AgentName, force?: boolean) => Promise<void>;
  killInstance: (session: string) => Promise<void>;
  killAllInstances: (agent: AgentName) => Promise<void>;
  clearError: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  coreAgents: [],
  spawnedSessions: [],
  loading: false,
  error: null,
  lastUpdate: 0,

  // Fetch and update agent status
  updateStatus: async () => {
    try {
      set({ loading: true, error: null });

      const status = await invoke<AgentStatusList>('get_agent_status');

      set({
        coreAgents: status.core,
        spawnedSessions: status.spawned,
        loading: false,
        lastUpdate: Date.now(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },

  // Launch core team
  launchCore: async () => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('launch_core');

      // Wait a moment for sessions to start, then refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await get().updateStatus();

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

      // Wait a moment for sessions to die, then refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      await get().updateStatus();

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

      // Wait for session to start, then refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await get().updateStatus();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },

  // Kill a specific instance
  killInstance: async (session: string) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_instance', { session });

      // Wait for session to die, then refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      await get().updateStatus();

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

      // Wait for sessions to die, then refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      await get().updateStatus();

      useToastStore.getState().success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill ${agent} instances: ${message}`);
    }
  },

  // Clear error message
  clearError: () => set({ error: null }),
}));
