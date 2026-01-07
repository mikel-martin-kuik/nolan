import React, { useMemo, useCallback, useState } from 'react';
import { MessageCircle, RefreshCw, Trash2, Activity, AlertCircle, Zap, Clock, Moon, ChevronLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLiveOutputStore } from '../../store/liveOutputStore';
import { useAgentStore } from '../../store/agentStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { useTeamStore } from '../../store/teamStore';
import { useWorkflowStatus, type AgentWithWorkflow } from '../../hooks/useWorkflowStatus';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { AgentListItem } from './AgentListItem';
import { cn } from '../../lib/utils';
import type { AgentStatus, TeamConfig } from '../../types';
import { getAgentDisplayNameForUI } from '../../lib/agentIdentity';
import { isCoreAgent as checkIsCoreAgent } from '../../types';

// Group configuration with icons and colors
const GROUP_CONFIG = {
  attention: {
    label: 'Needs Attention',
    icon: AlertCircle,
    dotColor: 'bg-yellow-500',
  },
  active: {
    label: 'Active',
    icon: Zap,
    dotColor: 'bg-green-500',
  },
  blocked: {
    label: 'Blocked',
    icon: Clock,
    dotColor: 'bg-red-500',
  },
  idle: {
    label: 'Idle',
    icon: Moon,
    dotColor: 'bg-zinc-500',
  },
} as const;

/**
 * Get display name for an agent, handling spawned instances
 * Uses agentIdentity utility for consistent naming (ralph shows as fun name)
 */
function getAgentDisplayName(agent: AgentStatus, team: TeamConfig | null): string {
  const session = agent.session;
  const withoutPrefix = session.replace(/^agent-/, '');
  const parts = withoutPrefix.split('-');

  // Check if this is a core agent using team config
  const isCoreAgent = checkIsCoreAgent(session, team);

  // Extract instanceId for spawned agents
  const instanceId = parts.length > 1 ? parts.slice(1).join('-') : undefined;

  return getAgentDisplayNameForUI(agent.name, instanceId, isCoreAgent);
}

export const ChatView: React.FC = () => {
  const { activeSession, setActiveChat } = useChatViewStore();
  const { agentOutputs, clearAll, clearSession } = useLiveOutputStore();
  const { coreAgents, spawnedSessions } = useAgentStore();
  const { currentTeam } = useTeamStore();
  const { grouped, projectFiles } = useWorkflowStatus();
  const [isRestarting, setIsRestarting] = React.useState(false);

  // Mobile: track whether to show chat panel (vs agent list)
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Combine all agents
  const allAgents = useMemo(
    () => [...coreAgents, ...spawnedSessions],
    [coreAgents, spawnedSessions]
  );

  // Flatten grouped agents in priority order: attention > active > blocked > idle
  const orderedAgents = useMemo(() => {
    return [
      ...grouped.attention,
      ...grouped.active,
      ...grouped.blocked,
      ...grouped.idle,
    ];
  }, [grouped]);

  // Get current agent and its data
  const currentAgent = useMemo(
    () => allAgents.find(a => a.session === activeSession),
    [allAgents, activeSession]
  );

  const currentOutput = activeSession ? agentOutputs[activeSession] : undefined;
  const entries = currentOutput?.entries || [];
  const isActive = currentOutput?.isActive || false;

  // Get workflow state for current agent
  const currentWorkflowState = useMemo(() => {
    return orderedAgents.find(aw => aw.agent.session === activeSession)?.state;
  }, [orderedAgents, activeSession]);

  // Auto-select first agent (top of priority list)
  React.useEffect(() => {
    if (!activeSession && orderedAgents.length > 0) {
      setActiveChat(orderedAgents[0].agent.session);
    }
  }, [activeSession, orderedAgents, setActiveChat]);

  // Also select first agent if current selection becomes invalid
  React.useEffect(() => {
    if (activeSession && orderedAgents.length > 0) {
      const stillExists = orderedAgents.some(aw => aw.agent.session === activeSession);
      if (!stillExists) {
        setActiveChat(orderedAgents[0].agent.session);
      }
    }
  }, [activeSession, orderedAgents, setActiveChat]);

  const handleRestartFeed = useCallback(async () => {
    setIsRestarting(true);
    try {
      await invoke('start_history_stream');
    } catch (err) {
      console.error('Failed to restart history stream:', err);
    } finally {
      setTimeout(() => setIsRestarting(false), 1000);
    }
  }, []);

  const totalMessages = useMemo(
    () => Object.values(agentOutputs).reduce(
      (sum, output) => sum + (output?.entries?.length || 0),
      0
    ),
    [agentOutputs]
  );

  // Handle agent selection (also opens chat on mobile)
  const handleSelectAgent = useCallback((session: string) => {
    setActiveChat(session);
    setShowMobileChat(true);
  }, [setActiveChat]);

  // Handle back button on mobile
  const handleBackToList = useCallback(() => {
    setShowMobileChat(false);
  }, []);

  // Count agents needing attention
  const attentionCount = grouped.attention.length;

  // Helper to render a group of agents with header
  const renderAgentGroup = (
    groupKey: keyof typeof GROUP_CONFIG,
    agents: AgentWithWorkflow[]
  ) => {
    if (agents.length === 0) return null;

    const config = GROUP_CONFIG[groupKey];
    const Icon = config.icon;

    return (
      <div key={groupKey} className="mb-3">
        <h3 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1 flex items-center gap-1.5 uppercase tracking-wider">
          <div className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)} />
          <Icon className="w-3 h-3" />
          <span>{config.label}</span>
          <span className="opacity-60">({agents.length})</span>
        </h3>
        <div className="space-y-1">
          {agents.map(({ agent, state }) => (
            <AgentListItem
              key={agent.session}
              agent={agent}
              output={agentOutputs[agent.session]}
              workflowState={state}
              projectFiles={projectFiles}
              isSelected={agent.session === activeSession}
              onClick={() => handleSelectAgent(agent.session)}
            />
          ))}
        </div>
      </div>
    );
  };

  // Render agent list sidebar content
  const renderAgentList = () => (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Agents</h2>
            {attentionCount > 0 && (
              <p className="text-[10px] text-yellow-400">
                {attentionCount} need{attentionCount > 1 ? '' : 's'} response
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRestartFeed}
              disabled={isRestarting}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              title="Restart live feed"
            >
              <RefreshCw className={cn('w-4 h-4', isRestarting && 'animate-spin')} />
            </button>
            {totalMessages > 0 && (
              <button
                onClick={clearAll}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Clear all messages"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Agent list by category */}
      <div className="flex-1 overflow-y-auto p-2">
        {orderedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No agents active</p>
            <p className="text-xs mt-1">Start an agent from Dashboard</p>
          </div>
        ) : (
          <>
            {renderAgentGroup('attention', grouped.attention)}
            {renderAgentGroup('active', grouped.active)}
            {renderAgentGroup('blocked', grouped.blocked)}
            {renderAgentGroup('idle', grouped.idle)}
          </>
        )}
      </div>
    </>
  );

  // Render chat panel content
  const renderChatPanel = () => {
    if (orderedAgents.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No active agents</p>
            <p className="text-sm">
              Start an agent from the Dashboard to chat with them
            </p>
          </div>
        </div>
      );
    }

    if (!currentAgent) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Select an agent</p>
            <p className="text-sm">
              Choose an agent from the list to start chatting
            </p>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* Chat header */}
        <div className="px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Back button - visible on mobile */}
              <button
                onClick={handleBackToList}
                className="md:hidden p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Back to agents"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div
                className={cn(
                  'w-3 h-3 rounded-full',
                  currentWorkflowState
                    ? currentWorkflowState.statusColor
                    : isActive
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-muted-foreground/40'
                )}
              />
              <div>
                <h3 className="font-medium">{getAgentDisplayName(currentAgent, currentTeam)}</h3>
                <p className="text-xs text-muted-foreground">
                  {currentWorkflowState?.statusLabel || (isActive ? 'Working' : 'Idle')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Project badge - hidden on small screens */}
              {currentAgent.current_project && currentAgent.current_project !== 'VIBING' && (
                <span className="hidden sm:inline-block text-xs px-2 py-1 bg-primary/10 text-primary rounded-lg">
                  {currentAgent.current_project}
                </span>
              )}

              {/* Context usage - hidden on extra small screens */}
              {currentAgent.active && currentAgent.context_usage !== undefined && (
                <div className="hidden xs:flex items-center gap-2">
                  <div className="w-12 sm:w-16 bg-secondary rounded-full h-1.5">
                    <div
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        currentAgent.context_usage >= 60 ? 'bg-red-500' :
                        currentAgent.context_usage >= 40 ? 'bg-yellow-500' :
                        'bg-green-500'
                      )}
                      style={{ width: `${currentAgent.context_usage}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {currentAgent.context_usage}%
                  </span>
                </div>
              )}

              {/* Clear messages for this agent */}
              {entries.length > 0 && (
                <button
                  onClick={() => clearSession(currentAgent.session)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Clear messages"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message list */}
        <ChatMessageList
          entries={entries}
          isActive={isActive}
          agentName={getAgentDisplayName(currentAgent)}
        />

        {/* Input bar */}
        <ChatInput
          session={currentAgent.session}
          disabled={!currentAgent.active}
          placeholder={
            currentAgent.active
              ? 'Type your response...'
              : `${getAgentDisplayName(currentAgent)} is not active`
          }
        />
      </>
    );
  };

  return (
    <div className="h-full flex">
      {/* Left sidebar - Agent list */}
      {/* On mobile: full width when chat not shown, hidden when chat shown */}
      {/* On desktop (md+): always visible with fixed width */}
      <div
        className={cn(
          'flex-col bg-card/30 border-r border-border',
          // Mobile: full width or hidden based on showMobileChat
          showMobileChat ? 'hidden' : 'flex w-full',
          // Desktop: always visible with fixed width
          'md:flex md:w-80 md:flex-shrink-0'
        )}
      >
        {renderAgentList()}
      </div>

      {/* Right panel - Chat */}
      {/* On mobile: full width when shown, hidden when list shown */}
      {/* On desktop (md+): always visible, takes remaining space */}
      <div
        className={cn(
          'flex-1 flex-col min-w-0',
          // Mobile: full width or hidden based on showMobileChat
          showMobileChat ? 'flex' : 'hidden',
          // Desktop: always visible
          'md:flex'
        )}
      >
        {renderChatPanel()}
      </div>
    </div>
  );
};
