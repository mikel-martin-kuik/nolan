import React, { memo, useCallback, useRef, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, MessageSquareX, Eraser, Terminal } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AgentStatus, AGENT_DESCRIPTIONS, AgentWorkflowState, AgentName, WORKFLOW_FILES } from '../../types';
import { getAgentDisplayNameForUI } from '../../lib/agentIdentity';
import { useLiveOutputStore, AgentLiveOutput } from '../../store/liveOutputStore';
import { useTerminalStore } from '../../store/terminalStore';
import { useToastStore } from '../../store/toastStore';
import { getBlockerMessage } from '../../lib/workflowStatus';
import { cn } from '../../lib/utils';
import { FEATURES } from '../../lib/features';
import type { FileCompletion } from '../../types/projects';

interface AgentListItemProps {
  agent: AgentStatus;
  output?: AgentLiveOutput;
  workflowState?: AgentWorkflowState;
  projectFiles?: FileCompletion[] | string[];
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Get display name for an agent, handling spawned instances
 * Uses agentIdentity utility for consistent naming (ralph shows as fun name)
 */
function getAgentDisplayName(agent: AgentStatus): string {
  const session = agent.session;
  const withoutPrefix = session.replace(/^agent-/, '');
  const parts = withoutPrefix.split('-');

  // Check if this is a core agent
  const isCoreAgent = /^agent-(ana|bill|carl|dan|enzo|ralph)$/.test(session);

  // Extract instanceId for spawned agents
  const instanceId = parts.length > 1 ? parts.slice(1).join('-') : undefined;

  return getAgentDisplayNameForUI(agent.name, instanceId, isCoreAgent);
}

export const AgentListItem: React.FC<AgentListItemProps> = memo(({
  agent,
  output,
  workflowState,
  projectFiles = [],
  isSelected,
  onClick,
}) => {
  const clearSession = useLiveOutputStore((state) => state.clearSession);
  const openTerminalModal = useTerminalStore((state) => state.openModal);
  const { error: showError } = useToastStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`agent-list-menu-${agent.session}`);

  const entries = output?.entries || [];
  const lastEntry = entries[entries.length - 1];
  const description = AGENT_DESCRIPTIONS[agent.name as AgentName] || 'Agent';
  const blockerMessage = workflowState ? getBlockerMessage(workflowState) : null;
  const displayName = getAgentDisplayName(agent);

  // Check if a workflow file is completed (has HANDOFF marker)
  const isFileCompleted = (key: string): boolean => {
    if (projectFiles.length === 0) return false;

    if (typeof projectFiles[0] === 'object' && 'completed' in projectFiles[0]) {
      const completions = projectFiles as FileCompletion[];
      const fileCompletion = completions.find(f => f.file.includes(key));
      return fileCompletion?.completed ?? false;
    }

    const existingFiles = projectFiles as string[];
    return existingFiles.some(f => f.includes(key));
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entries.length === 0 && !agent.active) return;

    window.dispatchEvent(new CustomEvent('agent-list-menu-open', { detail: menuId.current }));

    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

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

  useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('agent-list-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('agent-list-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  const handleClearMessages = () => {
    setContextMenu(null);
    clearSession(agent.session);
  };

  const handleClearContext = async () => {
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

  const handleOpenTerminal = () => {
    setContextMenu(null);
    openTerminalModal(agent.session, agent.name);
  };

  return (
    <>
      <Card
        onClick={onClick}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        role="button"
        aria-label={`Select ${displayName}`}
        className={cn(
          'glass-card transition-all duration-200 cursor-pointer relative',
          'hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:translate-y-0',
          agent.active ? 'glass-active' : 'opacity-80 hover:opacity-100',
          isSelected && 'ring-2 ring-primary/50 shadow-lg shadow-primary/10'
        )}
      >
        {/* Context usage circular progress (top right) */}
        {agent.active && agent.context_usage !== undefined && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5">
            <svg className="w-5 h-5 transform -rotate-90" viewBox="0 0 24 24">
              {/* Background circle */}
              <circle
                cx="12"
                cy="12"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-muted-foreground/20"
              />
              {/* Progress circle */}
              <circle
                cx="12"
                cy="12"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray={`${(agent.context_usage / 100) * 37.7} 37.7`}
                className={cn(
                  'transition-all duration-300',
                  agent.context_usage >= 60 ? 'text-red-500' :
                  agent.context_usage >= 40 ? 'text-yellow-500' :
                  'text-green-500'
                )}
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
        <CardHeader className="p-2.5 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className={cn(
                'truncate',
                agent.active ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}>
                {displayName}
              </span>
            </CardTitle>
          </div>

          <CardDescription className={cn(
            'text-[10px] line-clamp-1',
            agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}>
            {description}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-2.5 pt-0">
          {/* Workflow progress dots (only show if agent has a project) */}
          {workflowState && agent.current_project && agent.current_project !== 'VIBING' && (
            <div className="flex items-center gap-1 mb-1.5">
              {WORKFLOW_FILES.map((file) => (
                <div
                  key={file}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-colors',
                    isFileCompleted(file) ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                  title={`${file}.md${isFileCompleted(file) ? ' (completed)' : ''}`}
                />
              ))}
              <span className="text-[9px] text-muted-foreground ml-1">
                {workflowState.currentPhase}/{workflowState.totalPhases}
              </span>
            </div>
          )}

          {/* Blocker message or last activity preview */}
          <div className="min-h-[16px]">
            {blockerMessage ? (
              <div className="flex items-center gap-1 text-[10px] text-red-400">
                <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{blockerMessage}</span>
              </div>
            ) : lastEntry ? (
              <p className="text-[10px] text-muted-foreground/70 truncate">
                {lastEntry.preview || lastEntry.message?.slice(0, 50) || 'No content'}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground/50">
                {agent.active ? 'Idle' : 'Offline'}
              </p>
            )}
          </div>

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
              onClick={handleClearMessages}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <MessageSquareX className="w-4 h-4" />
              Clear Messages
            </button>
          )}
          {agent.active && (
            <button
              onClick={handleClearContext}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <Eraser className="w-4 h-4" />
              Clear Context
            </button>
          )}
          {FEATURES.EMBEDDED_TERMINAL && agent.active && (
            <button
              onClick={handleOpenTerminal}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <Terminal className="w-4 h-4" />
              Open Terminal
            </button>
          )}
        </div>
      )}
    </>
  );
});

AgentListItem.displayName = 'AgentListItem';
