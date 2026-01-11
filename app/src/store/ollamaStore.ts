import { create } from 'zustand';
import { invoke } from '@/lib/api';
import type { OllamaStatus, OllamaChatMessage } from '@/types/ollama';

/** Connection status type */
type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

/** LocalStorage keys */
const STORAGE_URL_KEY = 'nolan-ollama-url';
const STORAGE_MODEL_KEY = 'nolan-ollama-model';

/** Default values */
const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:1.5b';

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
}

/** Load config from localStorage with fallbacks */
function loadConfig(): { url: string; model: string } {
  const url = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_URL
    : DEFAULT_URL;
  const model = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_MODEL_KEY) || DEFAULT_MODEL
    : DEFAULT_MODEL;
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
          localStorage.setItem(STORAGE_MODEL_KEY, newModel);
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
      localStorage.setItem(STORAGE_MODEL_KEY, model);

      // Also update backend config
      invoke('ollama_set_config', { model }).catch(console.warn);
    },

    // Set Ollama URL
    setUrl: (url: string) => {
      set({ ollamaUrl: url });
      localStorage.setItem(STORAGE_URL_KEY, url);

      // Update backend config and recheck connection
      invoke('ollama_set_config', { url })
        .then(() => get().checkConnection())
        .catch(console.warn);
    },

    // Clear error
    clearError: () => set({ error: null }),
  };
});
