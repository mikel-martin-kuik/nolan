import React from 'react';
import { useEventAgents } from '@/hooks/useEventAgents';
import { EventAgentCard } from './EventAgentCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';

export const EventAgentsPanel: React.FC = () => {
  const { agents, loading, refreshAgents } = useEventAgents();

  return (
    <div className="h-full flex flex-col p-2 sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold">Event-Driven Agents</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Agents triggered by system events
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refreshAgents}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <Info className="h-10 sm:h-12 w-10 sm:w-12 mb-4" />
            <p className="text-center text-sm sm:text-base">
              No event-driven agents found.
            </p>
            <p className="text-xs sm:text-sm text-center mt-2">
              Create agents in <code className="bg-muted px-1 rounded text-xs">~/.nolan/event/agents/</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {agents.map((agent) => (
              <EventAgentCard
                key={agent.name}
                agent={agent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
