import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal, X, Play } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/agentStore';
import { AGENT_COLORS, AGENT_DESCRIPTIONS } from '@/types';
import type { AgentStatus as AgentStatusType, AgentName } from '@/types';

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

  /** Whether this is a spawned instance */
  isSpawned?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  variant = 'lifecycle',
  showActions = true,
  disabled = false,
  instanceNumber,
  // isSpawned is reserved for future use
}) => {
  const { spawnAgent, killInstance } = useAgentStore();
  const [isProcessing, setIsProcessing] = React.useState(false);

  // Get agent color and description
  const colorClass = AGENT_COLORS[agent.name as keyof typeof AGENT_COLORS] || 'bg-gray-500';
  const description = AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || agent.name;

  // Determine primary action based on agent state
  const getPrimaryAction = () => {
    if (!agent.active) {
      return {
        label: `Launch ${agent.name}`,
        ariaLabel: `Launch ${agent.name} agent`,
        icon: Play,
        handler: async () => {
          setIsProcessing(true);
          try {
            await spawnAgent(agent.name as AgentName);
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
            alert(`Failed to open terminal: ${error}`);
          } finally {
            setIsProcessing(false);
          }
        }
      };
    }
  };

  const primaryAction = getPrimaryAction();

  // Handle card click (primary action)
  const handleCardClick = () => {
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

  // Handle kill action
  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (!agent.active) return;

    if (window.confirm(`Kill ${agent.name} agent session?`)) {
      setIsProcessing(true);
      try {
        await killInstance(agent.session);
      } catch (error) {
        console.error('Failed to kill agent:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Determine if card should be clickable
  const isClickable = showActions && !disabled && !isProcessing;

  return (
    <Card
      className={`
        transition-all duration-200
        ${isClickable ? 'cursor-pointer hover:border-gray-600 hover:shadow-lg active:scale-[0.98]' : ''}
        ${isProcessing ? 'opacity-50' : ''}
        ${disabled ? 'cursor-not-allowed opacity-60' : ''}
        ${variant === 'dashboard' ? 'bg-gray-900/50' : variant === 'spawned' ? 'bg-gray-800/80' : 'bg-gray-800'}
      `}
      onClick={isClickable ? handleCardClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
      aria-label={isClickable ? primaryAction.ariaLabel : undefined}
      aria-disabled={disabled || isProcessing}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {/* Agent identity color dot */}
            <div
              className={`w-3 h-3 rounded-full ${colorClass}`}
              aria-hidden="true"
            />
            {/* Agent name */}
            <span className="capitalize text-white">{agent.name}</span>

            {/* Instance number badge for spawned agents */}
            {instanceNumber !== undefined && (
              <Badge variant="outline" className="text-xs">
                #{instanceNumber}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* Status badge */}
            <Badge
              variant={agent.active ? 'default' : 'destructive'}
              className={agent.active ? 'bg-status-online hover:bg-status-online/90' : 'bg-status-offline hover:bg-status-offline/90'}
              aria-live="polite"
            >
              {agent.active ? 'Online' : 'Offline'}
            </Badge>

            {/* Kill button (only when active and actions enabled) */}
            {agent.active && showActions && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-950/50"
                onClick={handleKill}
                aria-label={`Kill ${agent.name} agent`}
                disabled={disabled || isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="text-sm">
        {/* Session info */}
        <div className="text-gray-500 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Session:</span>
            <span className="text-gray-300 font-mono text-xs">{agent.session}</span>
          </div>

          {/* Additional info for lifecycle variant */}
          {variant === 'lifecycle' && agent.active && (
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="w-3 h-3 text-gray-500" aria-hidden="true" />
              <span className="text-gray-400">
                {agent.attached ? 'Terminal attached' : 'Terminal detached'}
              </span>
            </div>
          )}
        </div>

        {/* Action hint (only show when clickable) */}
        {isClickable && (
          <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500 flex items-center gap-2">
            <primaryAction.icon className="w-3 h-3" aria-hidden="true" />
            <span>Click to {primaryAction.label.toLowerCase()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
