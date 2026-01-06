import React, { useState, useMemo } from 'react';
import { Activity, Trash2, RefreshCw, AlertCircle, Zap, Clock, Moon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLiveOutputStore } from '../../store/liveOutputStore';
import { useAgentStore } from '../../store/agentStore';
import { useWorkflowStatus, type AgentWithWorkflow } from '../../hooks/useWorkflowStatus';
import { AgentLiveCard } from './AgentLiveCard';
import { LiveStreamModal } from './LiveStreamModal';
import { cn } from '../../lib/utils';

// Group configuration with icons and colors
const GROUP_CONFIG = {
  attention: {
    label: 'Needs Attention',
    icon: AlertCircle,
    dotColor: 'bg-yellow-500',
    description: 'Waiting for input or decision',
  },
  active: {
    label: 'Active',
    icon: Zap,
    dotColor: 'bg-green-500',
    description: 'Currently working',
  },
  blocked: {
    label: 'Blocked',
    icon: Clock,
    dotColor: 'bg-red-500',
    description: 'Waiting on dependencies',
  },
  idle: {
    label: 'Idle',
    icon: Moon,
    dotColor: 'bg-zinc-500',
    description: 'No active project',
  },
} as const;

export const LivePanel: React.FC = () => {
  const [isRestarting, setIsRestarting] = useState(false);

  const {
    agentOutputs,
    selectedSession,
    clearAll,
    getActiveSessions,
  } = useLiveOutputStore();

  const { coreAgents, spawnedSessions } = useAgentStore();

  // Use the workflow status hook for dependency-aware grouping
  const { grouped, projectFiles, currentProject } = useWorkflowStatus();

  // Combine all agents for display - memoized to avoid re-creating on every render
  const allAgents = useMemo(
    () => [...coreAgents, ...spawnedSessions],
    [coreAgents, spawnedSessions]
  );

  // Get sessions that have output
  const sessionsWithOutput = useMemo(
    () => getActiveSessions(),
    [getActiveSessions]
  );

  // Filter to only show agents that have output or are active - memoized
  const agentsToShow = useMemo(
    () =>
      allAgents.filter(
        (agent) =>
          agent.active || sessionsWithOutput.includes(agent.session)
      ),
    [allAgents, sessionsWithOutput]
  );

  // Count active (received message in last 5s) sessions - memoized
  const activeCount = useMemo(
    () =>
      Object.values(agentOutputs).filter((output) => output.isActive).length,
    [agentOutputs]
  );

  // Total message count - memoized
  const totalMessages = useMemo(
    () =>
      Object.values(agentOutputs).reduce(
        (sum, output) => sum + (output?.entries?.length || 0),
        0
      ),
    [agentOutputs]
  );

  // Find the agent for the modal - memoized
  const selectedAgent = useMemo(
    () =>
      selectedSession
        ? allAgents.find((a) => a.session === selectedSession)
        : undefined,
    [selectedSession, allAgents]
  );

  // Helper to render a group of agents
  const renderAgentGroup = (
    groupKey: keyof typeof GROUP_CONFIG,
    agents: AgentWithWorkflow[]
  ) => {
    if (agents.length === 0) return null;

    const config = GROUP_CONFIG[groupKey];
    const Icon = config.icon;

    return (
      <div key={groupKey}>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
          <Icon className="w-3.5 h-3.5" />
          <span>{config.label}</span>
          <span className="text-xs opacity-60">({agents.length})</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(({ agent, state }) => (
            <AgentLiveCard
              key={agent.session}
              agent={agent}
              output={agentOutputs[agent.session]}
              workflowState={state}
              projectFiles={projectFiles}
            />
          ))}
        </div>
      </div>
    );
  };

  const handleRestartFeed = async () => {
    setIsRestarting(true);
    try {
      await invoke('start_history_stream');
    } catch (err) {
      console.error('Failed to restart history stream:', err);
    } finally {
      setTimeout(() => setIsRestarting(false), 1000);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              Live Output
              {currentProject && (
                <span className="text-sm font-normal px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {currentProject}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeCount > 0 && (
                <>
                  <span className="text-green-500">{activeCount} streaming</span>
                  {' '}
                </>
              )}
              {grouped.blocked.length > 0 && (
                <>
                  <span className="text-red-400">{grouped.blocked.length} blocked</span>
                  {' '}
                </>
              )}
              {totalMessages > 0 && (
                <span>{totalMessages} messages</span>
              )}
              {activeCount === 0 && totalMessages === 0 && (
                <span>Real-time agent activity</span>
              )}
            </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestartFeed}
            disabled={isRestarting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Restart live feed"
          >
            <RefreshCw className={cn('w-4 h-4', isRestarting && 'animate-spin')} />
          </button>

          {totalMessages > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Agent Cards Grid - Grouped by workflow status */}
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
        <div className="flex-1 overflow-auto space-y-6">
          {/* Render groups in priority order: attention > active > blocked > idle */}
          {renderAgentGroup('attention', grouped.attention)}
          {renderAgentGroup('active', grouped.active)}
          {renderAgentGroup('blocked', grouped.blocked)}
          {renderAgentGroup('idle', grouped.idle)}
        </div>
      )}

      {/* Modal for viewing full stream */}
      <LiveStreamModal agent={selectedAgent} />
    </div>
  );
};
