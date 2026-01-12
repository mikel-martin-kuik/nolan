import React, { useCallback } from 'react';
import { usePredefinedAgents } from '@/hooks/usePredefinedAgents';
import { PredefinedAgentCard } from './PredefinedAgentCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';

export const PredefinedAgentsPanel: React.FC = () => {
  const { agents, loading, triggerAgent, refreshAgents } = usePredefinedAgents();

  const handleTrigger = useCallback(async (name: string) => {
    await triggerAgent(name);
  }, [triggerAgent]);

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">On-Demand Agents</h2>
          <p className="text-sm text-muted-foreground">
            Manually triggered agents for common tasks
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refreshAgents}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Info className="h-12 w-12 mb-4" />
            <p className="text-center">
              No predefined agents found.
            </p>
            <p className="text-sm text-center mt-2">
              Create agents in <code className="bg-muted px-1 rounded">~/.nolan/predefined/agents/</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <PredefinedAgentCard
                key={agent.name}
                agent={agent}
                onTrigger={handleTrigger}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
