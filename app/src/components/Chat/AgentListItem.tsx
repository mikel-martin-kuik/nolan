import React, { memo, useCallback, useRef, useEffect, useState } from 'react';
import { invoke, isTauri } from '@/lib/api';
import { Clock, MessageSquareX, Eraser, Terminal, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AgentStatus, AGENT_DESCRIPTIONS, AgentWorkflowState, AgentName, getWorkflowSteps } from '../../types';
import {
  getAgentDisplayNameForUI,
  parseRalphSession
} from '../../lib/agentIdentity';
import { useLiveOutputStore, AgentLiveOutput } from '../../store/liveOutputStore';
import { useTerminalStore } from '../../store/terminalStore';
import { useTeamStore } from '../../store/teamStore';
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
 * Get display name for an agent
 * - Team agents: capitalize the name (e.g., ana -> "Ana")
 * - Ralph: use the session name suffix (e.g., agent-ralph-ziggy -> "Ziggy")
 */
function getAgentDisplayName(agent: AgentStatus): string {
  // For Ralph, extract the name from the session (e.g., "ziggy" from "agent-ralph-ziggy")
  const ralphName = agent.name === 'ralph' ? parseRalphSession(agent.session) : undefined;
  return getAgentDisplayNameForUI(agent.name, ralphName);
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
  const { sshEnabled, getSshTerminalUrl } = useTerminalStore();
  const { error: showError } = useToastStore();
  const { currentTeam } = useTeamStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`agent-list-menu-${agent.session}`);

  const entries = output?.entries || [];
  // Find the last user prompt (entry_type === 'user') that doesn't contain "Warmup"
  const lastUserPrompt = [...entries].reverse().find(
    e => e.entry_type === 'user' && !e.message?.includes('Warmup')
  );
  const description = AGENT_DESCRIPTIONS[agent.name as AgentName] || 'Agent';
  const blockerMessage = workflowState ? getBlockerMessage(workflowState) : null;
  const displayName = getAgentDisplayName(agent);
  const workflowSteps = getWorkflowSteps(currentTeam);

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

  const handleOpenTerminal = async () => {
    setContextMenu(null);

    // Try SSH web terminal first (works in browser mode)
    if (sshEnabled) {
      const sshUrl = getSshTerminalUrl(agent.session);
      if (sshUrl) {
        window.open(sshUrl, agent.session, 'width=730,height=450,menubar=no,toolbar=no,location=no,status=no');
        return;
      }
    }

    // Fall back to native terminal (desktop only)
    if (isTauri() && FEATURES.EXTERNAL_TERMINAL) {
      try {
        await invoke('open_agent_terminal', { session: agent.session });
      } catch (err) {
        showError(`Failed to open external terminal: ${err}`);
      }
      return;
    }

    // No terminal option available
    showError('Terminal access requires SSH terminal configuration. Contact your administrator.');
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
          'glass-card transition-all duration-200 rounded-xl',
          'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
          agent.active ? 'glass-active' : 'opacity-80 hover:opacity-100',
          isSelected && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
        )}
      >
        <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <CardTitle className="flex items-center gap-1 text-xs sm:text-sm">
              <span className={cn(
                'truncate',
                agent.active ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}>
                {displayName}
              </span>
            </CardTitle>
          </div>

          <CardDescription className={cn(
            'text-[10px] sm:text-xs line-clamp-1',
            agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}>
            {description}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
          {/* Context usage bar (when active) */}
          {agent.active && agent.context_usage !== undefined && (
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 bg-muted-foreground/20 rounded-full h-1">
                <div
                  className={cn(
                    'h-1 rounded-full transition-all',
                    agent.context_usage >= 60 ? 'bg-red-500' :
                    agent.context_usage >= 40 ? 'bg-yellow-500' :
                    'bg-green-500'
                  )}
                  style={{ width: `${agent.context_usage}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-mono">
                {agent.context_usage}%
              </span>
            </div>
          )}

          {/* Workflow progress dots (only show if agent has a project) */}
          {workflowState && agent.current_project && agent.current_project !== 'VIBING' && (
            <div className="flex items-center gap-1 mb-1.5">
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
              <span className="text-[9px] text-muted-foreground ml-1">
                {workflowState.currentPhase}/{workflowState.totalPhases}
              </span>
            </div>
          )}

          {/* Blocker message or user's last prompt reminder */}
          <div className="min-h-[16px]">
            {blockerMessage ? (
              <div className="flex items-center gap-1 text-[10px] text-red-400">
                <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{blockerMessage}</span>
              </div>
            ) : lastUserPrompt ? (
              <p className="text-[10px] text-muted-foreground/70 truncate">
                {lastUserPrompt.preview || lastUserPrompt.message?.slice(0, 50) || 'No content'}
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
          {agent.active && (sshEnabled || (isTauri() && FEATURES.EXTERNAL_TERMINAL)) && (
            <button
              onClick={handleOpenTerminal}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              {sshEnabled ? <ExternalLink className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
              {sshEnabled ? 'Open SSH Terminal' : 'Open Terminal'}
            </button>
          )}
        </div>
      )}
    </>
  );
});

AgentListItem.displayName = 'AgentListItem';
