import React, { useCallback, useMemo, memo } from 'react';
import { invoke } from '@/lib/api';
import { MessageSquareX, Eraser, Clock, Terminal, MessageCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AgentStatus, AGENT_DESCRIPTIONS, AgentWorkflowState, getWorkflowSteps } from '../../types';
import { useTeamStore } from '../../store/teamStore';
import { getAgentVisualName } from '../../lib/agentIdentity';
import type { FileCompletion } from '../../types/projects';
import { useLiveOutputStore, AgentLiveOutput } from '../../store/liveOutputStore';
import { useTerminalStore } from '../../store/terminalStore';
import { useToastStore } from '../../store/toastStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { getBlockerMessage } from '../../lib/workflowStatus';
import { cn } from '../../lib/utils';
import { TerminalView } from '../Terminal/TerminalView';
import { FEATURES } from '../../lib/features';

interface AgentLiveCardProps {
  agent: AgentStatus;
  output?: AgentLiveOutput;
  workflowState?: AgentWorkflowState;
  projectFiles?: FileCompletion[] | string[];
}

const getEntryTypeColor = (_type: string): string => {
  return 'text-muted-foreground';
};

export const AgentLiveCard: React.FC<AgentLiveCardProps> = memo(({
  agent,
  output,
  workflowState,
  projectFiles = [],
}) => {
  const clearSession = useLiveOutputStore((state) => state.clearSession);
  const openTerminalModal = useTerminalStore((state) => state.openModal);
  const setActiveTeam = useChatViewStore((state) => state.setActiveTeam);
  const setAgentFilter = useChatViewStore((state) => state.setAgentFilter);
  const { error: showError } = useToastStore();
  const currentTeam = useTeamStore((state) => state.currentTeam);
  const workflowSteps = getWorkflowSteps(currentTeam);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [showTerminal, setShowTerminal] = React.useState(false);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useRef(`live-card-menu-${agent.session}`);

  const entries = output?.entries || [];
  const isActive = output?.isActive || false;
  const lastEntry = entries[entries.length - 1];

  const handleCardClick = () => {
    // Navigate to team chat and filter by this agent
    if (agent.team) {
      setActiveTeam(agent.team);
      setAgentFilter(agent.session);
    }
    window.dispatchEvent(new CustomEvent('navigate-to-chat'));
  };

  const description = AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || 'Agent';
  const displayName = getAgentVisualName(agent.name);

  // Get blocker message if blocked
  const blockerMessage = workflowState ? getBlockerMessage(workflowState) : null;

  // Memoize badge computation to avoid recalculating on every render
  const badgeInfo = useMemo(() => {
    if (!workflowState || !agent.current_project || agent.current_project === 'VIBING') {
      return null;
    }

    // Determine badge text
    const badgeText = workflowState.status === 'blocked' && workflowState.blockedBy
      ? workflowState.blockedBy
      : workflowState.statusLabel;

    // Don't show badge if it's redundant with the group label
    // Groups: attention="Needs Attention", active="Active", blocked="Blocked", idle="Idle"
    const redundantLabels: Record<string, string[]> = {
      blocked: ['Blocked'],
      idle: ['Idle'],
      attention: ['Needs Input'],
      active: ['Working'],
    };

    const isRedundant = redundantLabels[workflowState.status]?.includes(badgeText) ||
      (workflowState.status === 'blocked' && badgeText === 'Blocked') ||
      (workflowState.status === 'idle' && badgeText === 'Idle') ||
      (workflowState.status === 'waiting_input' && badgeText === 'Needs Input') ||
      (workflowState.status === 'working' && badgeText === 'Working');

    if (isRedundant) return null;

    return { text: badgeText, status: workflowState.status };
  }, [workflowState, agent.current_project]);

  // Check if a workflow file is completed (has HANDOFF marker)
  const isFileCompleted = (key: string): boolean => {
    if (projectFiles.length === 0) return false;

    // Check if it's FileCompletion[] (has 'completed' property)
    if (typeof projectFiles[0] === 'object' && 'completed' in projectFiles[0]) {
      const completions = projectFiles as FileCompletion[];
      const fileCompletion = completions.find(f => f.file.includes(key));
      return fileCompletion?.completed ?? false;
    }

    // Fallback: string[] - just check existence
    const existingFiles = projectFiles as string[];
    return existingFiles.some(f => f.includes(key));
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show menu if there are messages OR agent is active (for clear context)
    if (entries.length === 0 && !agent.active) return;

    // Broadcast event to close all other menus
    window.dispatchEvent(new CustomEvent('live-card-menu-open', { detail: menuId.current }));

    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

  // Create stable handler callbacks to avoid event listener leaks
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  const handleOtherMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  // Close context menu when clicking outside or when another card opens its menu
  React.useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('live-card-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('live-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  const handleClearMessagesFromMenu = () => {
    setContextMenu(null);
    clearSession(agent.session);
  };

  const handleClearContextFromMenu = async () => {
    setContextMenu(null);
    try {
      await invoke('send_agent_command', {
        session: agent.session,
        command: '/clear'
      });
    } catch (error) {
      console.error('Failed to clear context:', error);
      showError(`Failed to clear context: ${error}`);
    }
  };

  return (
    <>
    <Card
      className={cn(
        'glass-card transition-all duration-200 rounded-2xl cursor-pointer active:scale-[0.98]',
        agent.active ? 'glass-active' : 'opacity-80 hover:opacity-100'
      )}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-label={`View ${displayName} live output`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            {/* Status indicator dot - uses workflow state if available */}
            <div
              className={cn(
                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                workflowState
                  ? cn(
                      workflowState.statusColor,
                      workflowState.status === 'working' && 'shadow-lg shadow-green-500/50 animate-pulse',
                      workflowState.status === 'blocked' && 'shadow-lg shadow-red-500/30',
                      workflowState.status === 'offline' && 'border border-muted-foreground/60'
                    )
                  : cn(
                      isActive
                        ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                        : agent.active && entries.length === 0
                        ? 'bg-yellow-500/70'
                        : agent.active
                        ? 'bg-green-500/50'
                        : 'bg-muted-foreground/40 border border-muted-foreground/60'
                    )
              )}
            />
            <span className={cn(agent.active ? 'text-foreground' : 'text-muted-foreground')}>
              {displayName}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* Respond button - show when waiting for input */}
            {workflowState?.status === 'waiting_input' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Navigate to team chat and filter by this agent
                  if (agent.team) {
                    setActiveTeam(agent.team);
                    setAgentFilter(agent.session);
                  }
                  // Navigate to chat tab
                  window.dispatchEvent(new CustomEvent('navigate-to-chat'));
                }}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors flex items-center gap-1"
                title="Respond to agent"
              >
                <MessageCircle className="w-3 h-3" />
                Respond
              </button>
            )}
            {/* Terminal button - only show for active agents */}
            {FEATURES.EMBEDDED_TERMINAL && agent.active && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTerminal(!showTerminal);
                }}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  showTerminal ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                )}
                title={showTerminal ? 'Hide terminal' : 'Show terminal'}
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <CardDescription className={cn(
          'flex items-center gap-2',
          agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'
        )}>
          <span>{description}</span>
          {/* Workflow status badge - only show if it adds information beyond the group */}
          {badgeInfo && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium capitalize',
              badgeInfo.status === 'working' && 'bg-green-500/20 text-green-400',
              badgeInfo.status === 'blocked' && 'bg-red-500/20 text-red-400',
              badgeInfo.status === 'ready' && 'bg-blue-500/20 text-blue-400',
              badgeInfo.status === 'waiting_input' && 'bg-yellow-500/20 text-yellow-400',
              badgeInfo.status === 'complete' && 'bg-teal-500/20 text-teal-400',
              badgeInfo.status === 'idle' && 'bg-zinc-500/20 text-zinc-400',
            )}>
              {badgeInfo.text}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 flex flex-col min-h-[60px]">
        {/* Blocker message if blocked */}
        {blockerMessage && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 mb-2">
            <Clock className="w-3 h-3" />
            <span>{blockerMessage}</span>
          </div>
        )}

        {/* Workflow progress dots (only show if agent has a project) */}
        {workflowState && agent.current_project && agent.current_project !== 'VIBING' && (
          <div className="flex items-center gap-1 mb-2">
            {workflowSteps.map((step) => (
              <div
                key={step.key}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  isFileCompleted(step.key) ? 'bg-primary' : 'bg-muted-foreground/20'
                )}
                title={`${step.key}.md${isFileCompleted(step.key) ? ' (completed)' : ''}`}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">
              {workflowState.currentPhase}/{workflowState.totalPhases}
            </span>
          </div>
        )}

        {/* Context usage bar in middle (only when active and available) */}
        {agent.active && agent.context_usage !== undefined && (
          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-end text-xs">
              <span className="text-foreground font-mono">{agent.context_usage}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  agent.context_usage >= 60 ? 'bg-red-500' :
                  agent.context_usage >= 40 ? 'bg-yellow-500' :
                  'bg-green-500'
                )}
                style={{ width: `${agent.context_usage}%` }}
              />
            </div>
          </div>
        )}

        {/* Last message preview at bottom */}
        <div className="flex-1 flex items-center mt-4">
          {lastEntry ? (
            <div className="text-xs font-mono truncate text-muted-foreground w-full">
              <span className={getEntryTypeColor(lastEntry.entry_type)}>
                {lastEntry.entry_type.toUpperCase()}
              </span>{' '}
              {lastEntry.preview || (lastEntry.message?.slice(0, 80) ?? 'No content')}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground/50 w-full">
              {workflowState?.status === 'blocked' ? 'Waiting for dependencies...' : 'No messages yet'}
            </div>
          )}
        </div>

        {/* Inline terminal view - conditionally rendered */}
        {FEATURES.EMBEDDED_TERMINAL && showTerminal && agent.active && (
          <div className="mt-4 h-80 rounded-lg overflow-hidden border border-border">
            <TerminalView
              session={agent.session}
              agentName={agent.name}
              onClose={() => setShowTerminal(false)}
            />
          </div>
        )}
      </CardContent>
    </Card>

    {/* Context menu dropdown */}
    {contextMenu && (
      <div
        ref={contextMenuRef}
        className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[180px]"
        style={{
          left: `${contextMenu.x}px`,
          top: `${contextMenu.y}px`,
        }}
      >
        {entries.length > 0 && (
          <button
            onClick={handleClearMessagesFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <MessageSquareX className="w-4 h-4" />
            Clear Messages
          </button>
        )}
        {agent.active && (
          <button
            onClick={handleClearContextFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Eraser className="w-4 h-4" />
            Clear Context
          </button>
        )}
        {FEATURES.EMBEDDED_TERMINAL && agent.active && (
          <button
            onClick={() => {
              setContextMenu(null);
              openTerminalModal(agent.session, agent.name);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Terminal className="w-4 h-4" />
            Open Terminal Modal
          </button>
        )}
      </div>
    )}
    </>
  );
});

AgentLiveCard.displayName = 'AgentLiveCard';
