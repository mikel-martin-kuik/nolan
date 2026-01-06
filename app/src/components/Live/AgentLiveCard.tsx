import React, { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageSquareX, Eraser, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AgentStatus, AGENT_DESCRIPTIONS, AgentWorkflowState, WORKFLOW_FILES } from '../../types';
import { useLiveOutputStore, AgentLiveOutput } from '../../store/liveOutputStore';
import { useToastStore } from '../../store/toastStore';
import { getBlockerMessage } from '../../lib/workflowStatus';
import { cn } from '../../lib/utils';

interface AgentLiveCardProps {
  agent: AgentStatus;
  output?: AgentLiveOutput;
  workflowState?: AgentWorkflowState;
  projectFiles?: string[];
}

const getEntryTypeColor = (_type: string): string => {
  return 'text-muted-foreground';
};

export const AgentLiveCard: React.FC<AgentLiveCardProps> = ({
  agent,
  output,
  workflowState,
  projectFiles = [],
}) => {
  const openModal = useLiveOutputStore((state) => state.openModal);
  const clearSession = useLiveOutputStore((state) => state.clearSession);
  const { error: showError } = useToastStore();
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useRef(`live-card-menu-${agent.session}`);

  const entries = output?.entries || [];
  const isActive = output?.isActive || false;
  const lastEntry = entries[entries.length - 1];

  const handleCardClick = () => {
    openModal(agent.session);
  };

  const description = AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || 'Agent';

  // Get blocker message if blocked
  const blockerMessage = workflowState ? getBlockerMessage(workflowState) : null;

  // Check which workflow files exist
  const hasFile = (key: string) => projectFiles.some(f => f.includes(key));

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
      aria-label={`View ${agent.name} live output`}
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
              title={workflowState?.statusLabel || (isActive ? 'Streaming' : agent.active && entries.length === 0 ? 'Idle' : agent.active ? 'Online' : 'Offline')}
            />
            <span className={cn('capitalize', agent.active ? 'text-foreground' : 'text-muted-foreground')}>
              {agent.name}
            </span>
          </CardTitle>

          {/* Message count */}
          <span className="text-xs text-muted-foreground font-mono">
            {entries.length}
          </span>
        </div>

        <CardDescription className={cn(
          'flex items-center gap-2',
          agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'
        )}>
          <span>{description}</span>
          {/* Workflow status badge - only show if it adds information beyond the group */}
          {(() => {
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

            return (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium capitalize',
                workflowState.status === 'working' && 'bg-green-500/20 text-green-400',
                workflowState.status === 'blocked' && 'bg-red-500/20 text-red-400',
                workflowState.status === 'ready' && 'bg-blue-500/20 text-blue-400',
                workflowState.status === 'waiting_input' && 'bg-yellow-500/20 text-yellow-400',
                workflowState.status === 'complete' && 'bg-teal-500/20 text-teal-400',
                workflowState.status === 'idle' && 'bg-zinc-500/20 text-zinc-400',
              )}>
                {badgeText}
              </span>
            );
          })()}
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
            {WORKFLOW_FILES.map((file) => (
              <div
                key={file}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  hasFile(file) ? 'bg-primary' : 'bg-muted-foreground/20'
                )}
                title={`${file}.md`}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">
              {workflowState.currentPhase}/{workflowState.totalPhases}
            </span>
          </div>
        )}

        {/* Last message preview */}
        {lastEntry ? (
          <div className="text-xs font-mono truncate text-muted-foreground">
            <span className={getEntryTypeColor(lastEntry.entry_type)}>
              [{lastEntry.entry_type}]
            </span>{' '}
            {lastEntry.preview || (lastEntry.message?.slice(0, 80) ?? 'No content')}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/50">
            {workflowState?.status === 'blocked' ? 'Waiting for dependencies...' : 'No messages yet'}
          </div>
        )}

        {/* Context usage bar at bottom (only when active and available) */}
        {agent.active && agent.context_usage !== undefined && (
          <div className="mt-auto space-y-1 pt-2">
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
      </div>
    )}
    </>
  );
};
