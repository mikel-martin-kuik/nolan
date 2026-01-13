import React, { useCallback, useMemo } from 'react';
import { usePredefinedAgents } from '@/hooks/usePredefinedAgents';
import { useAgentTemplates } from '@/hooks/useAgentTemplates';
import { PredefinedAgentCard } from './PredefinedAgentCard';
import { TemplateCard } from './TemplateCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info, Package, Play } from 'lucide-react';

export const PredefinedAgentsPanel: React.FC = () => {
  const { agents, loading: loadingAgents, triggerAgent, refreshAgents } = usePredefinedAgents();
  const { templates, loading: loadingTemplates, installing, installTemplate, uninstallTemplate, refreshTemplates } = useAgentTemplates();

  const loading = loadingAgents || loadingTemplates;

  // Separate installed and available templates
  const installedTemplates = useMemo(
    () => templates.filter(t => t.installed),
    [templates]
  );

  const availableTemplates = useMemo(
    () => templates.filter(t => !t.installed),
    [templates]
  );

  const handleTrigger = useCallback(async (name: string) => {
    await triggerAgent(name);
  }, [triggerAgent]);

  const handleInstall = useCallback(async (name: string) => {
    const success = await installTemplate(name);
    if (success) {
      // Refresh agents list after install
      setTimeout(refreshAgents, 500);
    }
  }, [installTemplate, refreshAgents]);

  const handleUninstall = useCallback(async (name: string) => {
    const success = await uninstallTemplate(name);
    if (success) {
      // Refresh agents list after uninstall
      setTimeout(refreshAgents, 500);
    }
  }, [uninstallTemplate, refreshAgents]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refreshAgents(), refreshTemplates()]);
  }, [refreshAgents, refreshTemplates]);

  return (
    <div className="h-full flex flex-col p-2 sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold">On-Demand Agents</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manually triggered agents for common tasks
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-4 sm:space-y-6">
        {/* Installed Agents Section */}
        {agents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <Play className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-medium">Installed Agents</h3>
              <span className="text-xs text-muted-foreground">({agents.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
              {agents.map((agent) => (
                <PredefinedAgentCard
                  key={agent.name}
                  agent={agent}
                  onTrigger={handleTrigger}
                  onUninstall={handleUninstall}
                  isUninstalling={installing === agent.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available Templates Section */}
        {availableTemplates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <Package className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">Available Templates</h3>
              <span className="text-xs text-muted-foreground">({availableTemplates.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
              {availableTemplates.map((template) => (
                <TemplateCard
                  key={template.name}
                  template={template}
                  onInstall={handleInstall}
                  isInstalling={installing === template.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {agents.length === 0 && availableTemplates.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Info className="h-12 w-12 mb-4" />
            <p className="text-center">
              No predefined agents available.
            </p>
          </div>
        )}

        {/* All Templates Installed */}
        {agents.length === 0 && installedTemplates.length === 0 && availableTemplates.length > 0 && (
          <div className="text-center text-sm text-muted-foreground mt-4">
            Install templates above to start using on-demand agents
          </div>
        )}
      </div>
    </div>
  );
};
