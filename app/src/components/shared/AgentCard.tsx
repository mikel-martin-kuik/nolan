import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, X, Play, Eraser, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useAgentStore } from '@/store/agentStore';
import { useToastStore } from '@/store/toastStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AgentMessagesDialog } from '@/components/shared/AgentMessagesDialog';
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
  const [showMessagesDialog, setShowMessagesDialog] = React.useState(false);

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

  // Handle kill action - opens confirmation dialog
  const handleKill = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent card click
    if (!agent.active) return;
    setShowKillDialog(true);
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

  // Handle clear context action - opens confirmation dialog
  const handleClearContext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent card click
    if (!agent.active) return;
    setShowClearContextDialog(true);
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

  // Handle show messages action
  const handleShowMessages = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent card click
    if (!agent.active) return;
    setShowMessagesDialog(true);
  };

  // Determine if card should be clickable
  const isClickable = showActions && !disabled && !isProcessing;

  return (
    <Card
      className={`
        transition-all duration-200 rounded-xl backdrop-blur-sm
        ${isClickable ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${isProcessing ? 'opacity-50' : ''}
        ${disabled ? 'cursor-not-allowed opacity-60' : ''}
        ${agent.active
          ? 'bg-card/80 border border-green-500/30 shadow-lg shadow-green-500/5 hover:border-green-400/50 hover:bg-card'
          : 'bg-card/20 border border-dashed border-border opacity-60 hover:opacity-80 hover:border-primary/40 hover:bg-card/40'
        }
      `}
      onClick={isClickable ? (e) => handleCardClick(e) : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
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
                #{instanceNumber}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* Clear Context button (only when active and actions enabled) */}
            {agent.active && showActions && (
              <Tooltip content="Clear" side="left">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearContext}
                  aria-label={`Clear ${agent.name} context`}
                  disabled={disabled || isProcessing}
                  className="h-6 w-6 text-muted-foreground hover:text-yellow-500 hover:bg-transparent"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}

            {/* Messages button (only when active and actions enabled) */}
            {agent.active && showActions && (
              <Tooltip content="Messages" side="left">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShowMessages}
                  aria-label={`View messages for ${agent.name}`}
                  disabled={disabled || isProcessing}
                  className="h-6 w-6 text-muted-foreground hover:text-blue-500 hover:bg-transparent"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}

            {/* Kill button (only when active and actions enabled) */}
            {agent.active && showActions && (
              <Tooltip content="Kill" side="left">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleKill}
                  aria-label={`Kill ${agent.name} agent`}
                  disabled={disabled || isProcessing}
                  className="h-6 w-6 text-muted-foreground hover:text-red-500 hover:bg-transparent"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
          </div>
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

          {/* Context usage (only when active and available) */}
          {agent.active && agent.context_usage !== undefined && (
            <div className="space-y-1">
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
        </div>

        {/* Action hint (only show when clickable) - pinned to bottom */}
        {isClickable && (
          <div className={`mt-auto pt-4 text-xs flex items-center gap-2 ${
            !agent.active ? 'text-primary' : 'text-muted-foreground'
          }`}>
            <primaryAction.icon className="w-3 h-3" aria-hidden="true" />
            <span>Click to {primaryAction.label.toLowerCase()}</span>
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

      {/* Messages dialog */}
      <AgentMessagesDialog
        open={showMessagesDialog}
        onOpenChange={setShowMessagesDialog}
        sessionName={agent.session}
        agentName={agent.name}
      />
    </Card>
  );
};
