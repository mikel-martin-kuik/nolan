/**
 * ConfigContext - UI Configuration Provider
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (fetches config from backend)
 * - Context: Provides config to entire app tree
 *
 * This context provides:
 * - UI configuration from backend (~/.nolan/config.yaml)
 * - Loading and error states
 * - Typed access to all config sections
 *
 * The config is fetched once at app startup and cached indefinitely.
 * When config loads, it syncs runtime values (from env vars) to stores.
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { useUIConfig } from '../hooks/useUIConfig';
import { useOllamaStore } from '../store/ollamaStore';
import type { UIConfig } from '../types/config';

interface ConfigContextValue {
  config: UIConfig | undefined;
  isLoading: boolean;
  error: Error | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ConfigProviderProps {
  children: ReactNode;
}

/**
 * Provider component for UI configuration
 *
 * Fetches config from backend and provides it to all children.
 * Should be placed high in the component tree, inside QueryClientProvider.
 *
 * When config loads, syncs runtime values (from Docker env vars) to stores:
 * - ollamaStore: ollama_defaults (OLLAMA_URL, OLLAMA_MODEL)
 */
export function ConfigProvider({ children }: ConfigProviderProps) {
  const { config, isLoading, error } = useUIConfig();
  const syncOllamaConfig = useOllamaStore((state) => state.syncWithBackendConfig);

  // Sync runtime config to stores when config loads
  useEffect(() => {
    if (config?.ollama_defaults) {
      syncOllamaConfig(config.ollama_defaults);
    }
  }, [config?.ollama_defaults, syncOllamaConfig]);

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      isLoading,
      error: error as Error | null,
    }),
    [config, isLoading, error]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/**
 * Hook to access config context
 *
 * Must be used within a ConfigProvider
 */
export function useConfigContext(): ConfigContextValue {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error('useConfigContext must be used within a ConfigProvider');
  }

  return context;
}

/**
 * Hook for accessing just the config object
 * Returns undefined while loading
 */
export function useConfig(): UIConfig | undefined {
  const { config } = useConfigContext();
  return config;
}
