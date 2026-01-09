import { create } from 'zustand';
import { invoke, isBrowserMode } from '@/lib/api';
import { listen } from '@/lib/events';
import type { AgentStatusList, AgentName, ClaudeModel } from '../types';
import { useToastStore } from './toastStore';

// Polling interval for browser mode (status events are Tauri-only)
const BROWSER_POLL_INTERVAL = 3000; // 3 seconds

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
  // State
  teamAgents: AgentStatusList['team'];
  freeAgents: AgentStatusList['free'];
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  unlistenFn: (() => void) | null;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // Actions
  updateStatus: () => Promise<void>;
  launchTeam: (
    teamName: string,
    projectName: string,
    initialPrompt?: string,
    updatedOriginalPrompt?: string,
    followupPrompt?: string
  ) => Promise<void>;
  killTeam: (teamName: string) => Promise<void>;
  spawnAgent: (teamName: string, agent: AgentName, force?: boolean, model?: ClaudeModel) => Promise<void>;
  startAgent: (teamName: string, agent: AgentName) => Promise<void>;
  killInstance: (session: string) => Promise<void>;
  killAllInstances: (teamName: string, agent: AgentName) => Promise<void>;
  clearError: () => void;
  setupEventListeners: () => Promise<void>;
  cleanup: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  teamAgents: [],
  freeAgents: [],
  loading: false,
  error: null,
  lastUpdate: 0,
  unlistenFn: null,
  pollIntervalId: null,

  // Fetch and update agent status
  updateStatus: async () => {
    try {
      // Don't set loading state for background refreshes
      // Only user actions (launch, kill, spawn) should show loading
      const status = await invoke<AgentStatusList>('get_agent_status');

      set({
        teamAgents: status.team,
        freeAgents: status.free,
        lastUpdate: Date.now(),
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  // Launch team with project context
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
      }, 60000); // 60s timeout for launch (includes waiting for Claude to be ready)

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Team ${teamName} launched for ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to launch team ${teamName}: ${message}`);
    }
  },

  // Kill team (requires user confirmation in component)
  killTeam: async (teamName: string) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('kill_team', { teamName });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Team ${teamName} terminated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to kill team ${teamName}: ${message}`);
    }
  },

  // Spawn a new agent instance
  spawnAgent: async (teamName: string, agent: AgentName, force = false, model?: ClaudeModel) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('spawn_agent', { teamName, agent, force, model });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Spawned ${agent} instance in team ${teamName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to spawn ${agent}: ${message}`);
    }
  },

  // Start a team agent (creates team-scoped session)
  startAgent: async (teamName: string, agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      await invoke<string>('start_agent', { teamName, agent });

      // Status will update via 'agent-status-changed' event
      set({ loading: false });
      useToastStore.getState().success(`Started ${agent} in team ${teamName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
      useToastStore.getState().error(`Failed to start ${agent}: ${message}`);
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
  killAllInstances: async (teamName: string, agent: AgentName) => {
    try {
      set({ loading: true, error: null });

      const result = await invoke<string>('kill_all_instances', { teamName, agent });

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
    if (state.unlistenFn || state.pollIntervalId) {
      return;
    }

    // In browser mode, use polling since WebSocket events aren't available
    if (isBrowserMode()) {
      // Initial fetch
      await get().updateStatus();

      // Set up polling interval
      const pollId = setInterval(() => {
        get().updateStatus();
      }, BROWSER_POLL_INTERVAL);

      set({ pollIntervalId: pollId });
      return;
    }

    // In Tauri mode, listen for agent status changes from backend
    const unlisten = await listen<AgentStatusList>('agent-status-changed', (event) => {
      set({
        teamAgents: event.payload.team,
        freeAgents: event.payload.free,
        lastUpdate: Date.now(),
      });
    });

    set({ unlistenFn: unlisten });
  },

  // Cleanup event listeners and polling
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
