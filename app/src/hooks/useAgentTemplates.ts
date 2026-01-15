import { useCallback, useState } from 'react';
import { invoke } from '@/lib/api';
import { useFetchData } from './useFetchData';
import { useToastStore } from '../store/toastStore';
import type { TemplateInfo } from '@/types';

export interface UseAgentTemplatesResult {
  templates: TemplateInfo[];
  loading: boolean;
  installing: string | null;
  refreshTemplates: () => Promise<void>;
  installTemplate: (name: string) => Promise<boolean>;
  uninstallTemplate: (name: string) => Promise<boolean>;
}

/**
 * Hook for managing agent templates.
 *
 * Templates are embedded in the binary and can be installed to ~/.nolan/agents/
 * (shared agents directory, distinct from team-specific agents in ~/.nolan/teams/{team}/agents/)
 */
export function useAgentTemplates(): UseAgentTemplatesResult {
  const { error: showError, success: showSuccess } = useToastStore();
  const [installing, setInstalling] = useState<string | null>(null);

  const {
    data: templates,
    loading,
    refresh: refreshTemplates,
  } = useFetchData({
    fetcher: () => invoke<TemplateInfo[]>('list_agent_templates'),
    defaultValue: [],
    errorMessage: 'Failed to load agent templates',
  });

  const installTemplate = useCallback(async (name: string): Promise<boolean> => {
    try {
      setInstalling(name);
      await invoke('install_agent_template', { name });
      showSuccess(`Installed ${name}`);
      await refreshTemplates();
      return true;
    } catch (err) {
      showError(`Failed to install template: ${err}`);
      return false;
    } finally {
      setInstalling(null);
    }
  }, [showError, showSuccess, refreshTemplates]);

  const uninstallTemplate = useCallback(async (name: string): Promise<boolean> => {
    try {
      setInstalling(name);
      await invoke('uninstall_agent_template', { name });
      showSuccess(`Uninstalled ${name}`);
      await refreshTemplates();
      return true;
    } catch (err) {
      showError(`Failed to uninstall template: ${err}`);
      return false;
    } finally {
      setInstalling(null);
    }
  }, [showError, showSuccess, refreshTemplates]);

  return {
    templates,
    loading,
    installing,
    refreshTemplates,
    installTemplate,
    uninstallTemplate,
  };
}
