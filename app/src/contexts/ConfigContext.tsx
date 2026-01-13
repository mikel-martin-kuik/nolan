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
 */

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { useUIConfig } from '../hooks/useUIConfig';
import { useTerminalStore } from '../store/terminalStore';
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
 */
export function ConfigProvider({ children }: ConfigProviderProps) {
  const { config, isLoading, error } = useUIConfig();
  const setSshConfig = useTerminalStore((state) => state.setSshConfig);

  // Initialize SSH terminal config when config is loaded
  useEffect(() => {
    if (config?.ssh_terminal) {
      setSshConfig(config.ssh_terminal.base_url, config.ssh_terminal.enabled);
    }
  }, [config?.ssh_terminal, setSshConfig]);

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
