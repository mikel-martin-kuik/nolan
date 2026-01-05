import React, { useEffect } from 'react';
import { Activity, Trash2, ArrowDownToLine } from 'lucide-react';
import { useLiveOutputStore } from '../../store/liveOutputStore';
import { useAgentStore } from '../../store/agentStore';
import { AgentLiveCard } from './AgentLiveCard';
import { cn } from '../../lib/utils';

export const LivePanel: React.FC = () => {
  const {
    agentOutputs,
    autoScroll,
    toggleAutoScroll,
    clearAll,
    getActiveSessions,
  } = useLiveOutputStore();

  const { coreAgents, spawnedSessions } = useAgentStore();

  // Combine all agents for display
  const allAgents = [...coreAgents, ...spawnedSessions];

  // Get sessions that have output
  const sessionsWithOutput = getActiveSessions();

  // Filter to only show agents that have output or are active
  const agentsToShow = allAgents.filter(
    (agent) =>
      agent.active || sessionsWithOutput.includes(agent.session)
  );

  // Count active (received message in last 5s) sessions
  const activeCount = Object.values(agentOutputs).filter(
    (output) => output.isActive
  ).length;

  // Total message count
  const totalMessages = Object.values(agentOutputs).reduce(
    (sum, output) => sum + output.entries.length,
    0
  );

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Live Output</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount > 0 ? (
                <>
                  <span className="text-green-500">{activeCount} active</span>
                  {' '}&middot;{' '}
                </>
              ) : null}
              {totalMessages} messages buffered
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoScroll}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
              autoScroll
                ? 'bg-primary/10 text-primary'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-secondary text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      </div>

      {/* Agent Cards Grid */}
      {agentsToShow.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No active agents</p>
            <p className="text-sm">
              Start an agent from the Dashboard to see live output here
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agentsToShow.map((agent) => (
              <AgentLiveCard
                key={agent.session}
                agent={agent}
                output={agentOutputs[agent.session]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
