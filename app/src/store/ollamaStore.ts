import { create } from 'zustand';
import { invoke } from '@/lib/api';
import type { OllamaStatus, OllamaChatMessage } from '@/types/ollama';
import type { OllamaDefaults } from '@/types/config';
import {
  STORAGE_OLLAMA_URL,
  STORAGE_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_MODEL,
} from '@/lib/constants';

/** Connection status type */
type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

interface OllamaStore {
  // State
  status: ConnectionStatus;
  version: string | null;
  models: string[];
  selectedModel: string;
  ollamaUrl: string;
  loading: boolean;
  error: string | null;

  // Actions
  checkConnection: () => Promise<void>;
  loadModels: () => Promise<void>;
  generate: (prompt: string, system?: string) => Promise<string>;
  chat: (messages: OllamaChatMessage[]) => Promise<OllamaChatMessage>;
  setModel: (model: string) => void;
  setUrl: (url: string) => void;
  clearError: () => void;
  /** Sync with backend config (call after UIConfig is loaded) */
  syncWithBackendConfig: (config: OllamaDefaults) => void;
}

/** Load config from localStorage with fallbacks */
function loadConfig(): { url: string; model: string } {
  const url = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_OLLAMA_URL) || DEFAULT_OLLAMA_URL
    : DEFAULT_OLLAMA_URL;
  const model = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_OLLAMA_MODEL) || DEFAULT_OLLAMA_MODEL
    : DEFAULT_OLLAMA_MODEL;
  return { url, model };
}

export const useOllamaStore = create<OllamaStore>((set, get) => {
  const config = loadConfig();

  return {
    // Initial state
    status: 'checking',
    version: null,
    models: [],
    selectedModel: config.model,
    ollamaUrl: config.url,
    loading: false,
    error: null,

    // Check connection to Ollama server
    checkConnection: async () => {
      set({ status: 'checking', error: null });

      try {
        const result = await invoke<OllamaStatus>('ollama_status');

        set({
          status: result.connected ? 'connected' : 'disconnected',
          version: result.version || null,
        });

        // If connected, also load models
        if (result.connected) {
          get().loadModels();
        }
      } catch {
        set({ status: 'disconnected', version: null });
      }
    },

    // Load available models from Ollama
    loadModels: async () => {
      try {
        const models = await invoke<string[]>('ollama_models');
        set({ models });

        // If selected model not in list and list has models, select first one
        const { selectedModel } = get();
        if (models.length > 0 && !models.includes(selectedModel)) {
          const newModel = models[0];
          set({ selectedModel: newModel });
          localStorage.setItem(STORAGE_OLLAMA_MODEL, newModel);
        }
      } catch (error) {
        // Silent failure - models list stays empty
        console.warn('Failed to load Ollama models:', error);
      }
    },

    // Generate text using Ollama
    generate: async (prompt: string, system?: string): Promise<string> => {
      const { selectedModel, status } = get();

      if (status !== 'connected') {
        throw new Error('Ollama is not connected');
      }

      set({ loading: true, error: null });

      try {
        const response = await invoke<string>('ollama_generate', {
          model: selectedModel,
          prompt,
          system,
        });

        set({ loading: false });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ loading: false, error: message });
        throw error;
      }
    },

    // Chat with Ollama
    chat: async (messages: OllamaChatMessage[]): Promise<OllamaChatMessage> => {
      const { selectedModel, status } = get();

      if (status !== 'connected') {
        throw new Error('Ollama is not connected');
      }

      set({ loading: true, error: null });

      try {
        const response = await invoke<OllamaChatMessage>('ollama_chat', {
          model: selectedModel,
          messages,
        });

        set({ loading: false });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ loading: false, error: message });
        throw error;
      }
    },

    // Set selected model
    setModel: (model: string) => {
      set({ selectedModel: model });
      localStorage.setItem(STORAGE_OLLAMA_MODEL, model);

      // Also update backend config
      invoke('ollama_set_config', { model }).catch((err) => {
        console.warn('Failed to save model config to backend:', err);
        // Recheck connection to sync state
        get().checkConnection();
      });
    },

    // Set Ollama URL
    setUrl: (url: string) => {
      set({ ollamaUrl: url });
      localStorage.setItem(STORAGE_OLLAMA_URL, url);

      // Update backend config and recheck connection
      invoke('ollama_set_config', { url })
        .then(() => get().checkConnection())
        .catch((err) => {
          console.warn('Failed to save URL config to backend:', err);
          // Still try to check connection with new URL
          get().checkConnection();
        });
    },

    // Clear error
    clearError: () => set({ error: null }),

    // Sync with backend config (for Docker env var support)
    // Call this after UIConfig is loaded to pick up OLLAMA_URL and OLLAMA_MODEL env vars
    syncWithBackendConfig: (config: OllamaDefaults) => {
      const { ollamaUrl, selectedModel } = get();

      // Only update if localStorage doesn't have values (user hasn't customized)
      const storedUrl = localStorage.getItem(STORAGE_OLLAMA_URL);
      const storedModel = localStorage.getItem(STORAGE_OLLAMA_MODEL);

      let updated = false;

      // Update URL if not customized and backend has different value
      if (!storedUrl && config.url !== ollamaUrl) {
        set({ ollamaUrl: config.url });
        updated = true;
      }

      // Update model if not customized and backend has different value
      if (!storedModel && config.model !== selectedModel) {
        set({ selectedModel: config.model });
        updated = true;
      }

      // Recheck connection if config changed
      if (updated) {
        get().checkConnection();
      }
    },
  };
});
