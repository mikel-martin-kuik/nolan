import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, Play, Eraser, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useAgentStore } from '@/store/agentStore';
import { useToastStore } from '@/store/toastStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AGENT_DESCRIPTIONS, isValidAgentName } from '@/types';
import type { AgentStatus as AgentStatusType } from '@/types';

interface AgentCardProps {
  /** Agent data from store */
  agent: AgentStatusType;

  /** Display variant */
  variant?: 'dashboard' | 'lifecycle' | 'spawned';

  /** Show action buttons */
  showActions?: boolean;

  /** Disabled state */
  disabled?: boolean;

  /** Instance number for spawned agents (e.g., 2 for agent-ana-2) */
  instanceNumber?: number;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  variant = 'lifecycle',
  showActions = true,
  disabled = false,
  instanceNumber,
}) => {
  const { spawnAgent, restartCoreAgent, killInstance } = useAgentStore();
  const { error: showError } = useToastStore();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showKillDialog, setShowKillDialog] = React.useState(false);
  const [showClearContextDialog, setShowClearContextDialog] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);

  // Check if this is a core agent (session name matches agent-{name} exactly, no number)
  const isCoreAgent = /^agent-(ana|bill|carl|dan|enzo|ralph)$/.test(agent.session);

  // Get agent description with runtime validation
  const description = isValidAgentName(agent.name)
    ? AGENT_DESCRIPTIONS[agent.name]
    : agent.name;

  // Determine primary action based on agent state
  const getPrimaryAction = () => {
    if (!agent.active) {
      return {
        label: isCoreAgent ? `Restart ${agent.name}` : `Launch ${agent.name}`,
        ariaLabel: isCoreAgent ? `Restart ${agent.name} agent` : `Launch ${agent.name} agent`,
        icon: Play,
        handler: async () => {
          setIsProcessing(true);
          try {
            // Use restartCoreAgent for core agents, spawnAgent for instances
            if (isCoreAgent && isValidAgentName(agent.name)) {
              await restartCoreAgent(agent.name);
            } else if (isValidAgentName(agent.name)) {
              await spawnAgent(agent.name);
            }
          } catch (error) {
            console.error('Failed to launch agent:', error);
          } finally {
            setIsProcessing(false);
          }
        }
      };
    } else {
      return {
        label: `Open terminal`,
        ariaLabel: `Open terminal for ${agent.name}`,
        icon: Terminal,
        handler: async () => {
          setIsProcessing(true);
          try {
            await invoke('open_agent_terminal', { session: agent.session });
          } catch (error) {
            showError(`Failed to open terminal: ${error}`);
          } finally {
            setIsProcessing(false);
          }
        }
      };
    }
  };

  const primaryAction = getPrimaryAction();

  // Handle card click (primary action)
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on a button or inside a button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    if (!disabled && !isProcessing && showActions) {
      primaryAction.handler();
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isProcessing && showActions) {
      e.preventDefault();
      primaryAction.handler();
    }
  };

  // Confirmed kill action
  const handleConfirmKill = async () => {
    setIsProcessing(true);
    try {
      await killInstance(agent.session);
    } catch (error) {
      console.error('Failed to kill agent:', error);
      showError(`Failed to kill agent: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirmed clear context action
  const handleConfirmClearContext = async () => {
    setIsProcessing(true);
    try {
      await invoke('send_agent_command', {
        session: agent.session,
        command: '/clear'
      });
    } catch (error) {
      console.error('Failed to clear context:', error);
      showError(`Failed to clear context: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine if card should be clickable
  const isClickable = showActions && !disabled && !isProcessing;

  // Unique identifier for this card's menu
  const menuId = React.useRef(`agent-card-menu-${agent.session}`);

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!agent.active || !showActions) return;

    // Broadcast event to close all other agent card menus
    window.dispatchEvent(new CustomEvent('agent-card-menu-open', { detail: menuId.current }));

    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
  };

  // Close context menu when clicking outside or when another card opens its menu
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleOtherMenuOpen = (e: CustomEvent<string>) => {
      // Close this menu if another card opened its menu
      if (e.detail !== menuId.current) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      window.addEventListener('agent-card-menu-open', handleOtherMenuOpen as EventListener);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        window.removeEventListener('agent-card-menu-open', handleOtherMenuOpen as EventListener);
      };
    }
  }, [contextMenu]);

  // Handle context menu option clicks
  const handleClearFromMenu = () => {
    setContextMenu(null);
    setShowClearContextDialog(true);
  };

  const handleKillFromMenu = () => {
    setContextMenu(null);
    setShowKillDialog(true);
  };


  return (
    <>
      <Card
        className={`
          glass-card transition-all duration-200 rounded-2xl
          ${isClickable ? 'cursor-pointer active:scale-[0.98]' : ''}
          ${isProcessing ? 'opacity-50' : ''}
          ${disabled ? 'cursor-not-allowed opacity-60' : ''}
          ${agent.active ? 'glass-active' : 'opacity-80 hover:opacity-100'}
        `}
        onClick={isClickable ? (e) => handleCardClick(e) : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        onContextMenu={handleContextMenu}
        tabIndex={isClickable ? 0 : undefined}
        role={isClickable ? 'button' : undefined}
        aria-label={isClickable ? primaryAction.ariaLabel : undefined}
        aria-disabled={disabled || isProcessing}
      >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {/* Status indicator dot */}
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                agent.active
                  ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                  : 'bg-muted-foreground/40 border border-muted-foreground/60'
              }`}
              title={agent.active ? 'Online' : 'Offline'}
              aria-label={agent.active ? 'Online' : 'Offline'}
            />

            {/* Agent name */}
            <span className={`capitalize ${agent.active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {agent.name}
            </span>

            {/* Instance number badge for spawned agents */}
            {instanceNumber !== undefined && (
              <Badge variant="outline" className="text-xs">
                {instanceNumber}
              </Badge>
            )}
          </CardTitle>

          {/* Project bubble - right corner (max 6 chars) */}
          {agent.active && (() => {
            const projectName = agent.current_project || 'VIBING';
            const isShortened = projectName.length > 6;
            const bubble = (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  agent.current_project
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {projectName.slice(0, 6)}
              </span>
            );
            return isShortened ? (
              <Tooltip content={projectName} side="top">{bubble}</Tooltip>
            ) : bubble;
          })()}
        </div>

        <CardDescription className={agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'}>
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="text-sm flex flex-col min-h-[80px]">
        {/* Session info */}
        <div className="text-muted-foreground space-y-1">
          {/* Additional info for lifecycle variant */}
          {variant === 'lifecycle' && agent.active && (
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">
                {agent.attached ? 'Terminal attached' : 'Terminal detached'}
              </span>
            </div>
          )}
        </div>

        {/* Context usage bar at bottom (only when active and available) */}
        {agent.active && agent.context_usage !== undefined && (
          <div className="mt-auto space-y-1">
            <div className="flex items-center justify-end text-xs">
              <span className="text-foreground font-mono">{agent.context_usage}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  agent.context_usage >= 60 ? 'bg-red-500' :
                  agent.context_usage >= 40 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${agent.context_usage}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>

      {/* Kill confirmation dialog */}
      <ConfirmDialog
        open={showKillDialog}
        onOpenChange={setShowKillDialog}
        title="Kill Agent Session"
        description={`Are you sure you want to kill ${agent.name} agent session? This will terminate the agent immediately.`}
        confirmLabel="Kill"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKill}
        variant="destructive"
      />

      {/* Clear context confirmation dialog */}
      <ConfirmDialog
        open={showClearContextDialog}
        onOpenChange={setShowClearContextDialog}
        title="Clear Agent Context"
        description={`Are you sure you want to clear ${agent.name}'s conversation context? This will remove all previous messages from the agent's memory.`}
        confirmLabel="Clear"
        cancelLabel="Cancel"
        onConfirm={handleConfirmClearContext}
        variant="default"
      />
      </Card>

      {/* Context menu dropdown - rendered completely outside Card */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={handleClearFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Eraser className="w-4 h-4" />
            Clear Context
          </button>
          <button
            onClick={handleKillFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Kill Agent
          </button>
        </div>
      )}
    </>
  );
};
