import { create } from 'zustand';
import { invoke } from '@/lib/api';

/** Provider information */
export interface ProviderInfo {
  name: string;
  available: boolean;
  description: string;
}

/** Response from get_providers_status */
interface ProvidersStatusResponse {
  providers: ProviderInfo[];
  default_provider: string;
}

/** Response from set_default_cli_provider */
interface DefaultProviderResponse {
  default_provider: string;
}

/** Connection status type */
type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface ProviderStore {
  // State
  status: FetchStatus;
  providers: ProviderInfo[];
  defaultProvider: string;
  error: string | null;

  // Actions
  fetchProviders: () => Promise<void>;
  setDefaultProvider: (provider: string | null) => Promise<void>;
  clearError: () => void;
}

export const useProviderStore = create<ProviderStore>((set) => ({
  // Initial state
  status: 'idle',
  providers: [],
  defaultProvider: 'claude',
  error: null,

  // Fetch providers status from backend
  fetchProviders: async () => {
    set({ status: 'loading', error: null });

    try {
      const result = await invoke<ProvidersStatusResponse>('get_providers_status');

      set({
        status: 'success',
        providers: result.providers,
        defaultProvider: result.default_provider,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
    }
  },

  // Set the default CLI provider for all agents
  setDefaultProvider: async (provider: string | null) => {
    console.log('[ProviderStore] Setting default provider to:', provider);
    set({ status: 'loading', error: null });

    try {
      const result = await invoke<DefaultProviderResponse>('set_default_cli_provider', {
        provider,
      });
      console.log('[ProviderStore] Result:', result);

      set({
        status: 'success',
        defaultProvider: result.default_provider,
      });
    } catch (error) {
      console.error('[ProviderStore] Error setting default provider:', error);
      const message = error instanceof Error ? error.message : String(error);
      set({ status: 'error', error: message });
      throw error; // Re-throw so UI can handle it
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
