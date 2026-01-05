import React from 'react';
import { ChevronDown, ChevronUp, Activity, Trash2 } from 'lucide-react';
import { AgentStatus, AGENT_DESCRIPTIONS, HistoryEntry } from '../../types';
import { useLiveOutputStore, AgentLiveOutput } from '../../store/liveOutputStore';
import { LiveMessageList } from './LiveMessageList';
import { cn } from '../../lib/utils';

interface AgentLiveCardProps {
  agent: AgentStatus;
  output?: AgentLiveOutput;
}

export const AgentLiveCard: React.FC<AgentLiveCardProps> = ({
  agent,
  output,
}) => {
  const { expandedAgents, toggleExpanded, clearSession } = useLiveOutputStore();

  const isExpanded = expandedAgents.has(agent.session);
  const entries = output?.entries || [];
  const isActive = output?.isActive || false;
  const lastEntry = entries[entries.length - 1];

  // Parse instance number from session name (e.g., "agent-bill-2" -> 2)
  const instanceMatch = agent.session.match(/-(\d+)$/);
  const instanceNumber = instanceMatch ? parseInt(instanceMatch[1], 10) : null;

  // Get agent color based on name
  const getAgentColor = (name: string): string => {
    const colors: Record<string, string> = {
      ana: 'border-l-pink-500',
      bill: 'border-l-blue-500',
      carl: 'border-l-amber-500',
      dan: 'border-l-violet-500',
      enzo: 'border-l-emerald-500',
      ralph: 'border-l-zinc-500',
    };
    return colors[name.toLowerCase()] || 'border-l-gray-500';
  };

  const agentColor = getAgentColor(agent.name);
  const description = AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || 'Agent';

  return (
    <div
      className={cn(
        'bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden',
        'border-l-4',
        agentColor
      )}
    >
      {/* Header - always visible */}
      <button
        onClick={() => toggleExpanded(agent.session)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Activity indicator */}
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              isActive
                ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                : agent.active
                ? 'bg-green-500/50'
                : 'bg-muted-foreground/40'
            )}
          />

          {/* Agent info */}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{agent.name}</span>
              {instanceNumber && (
                <span className="text-xs text-muted-foreground">
                  #{instanceNumber}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                ({description})
              </span>
            </div>
            {agent.current_project && (
              <span className="text-xs text-muted-foreground">
                {agent.current_project}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Message count */}
          <span className="text-xs text-muted-foreground">
            {entries.length} messages
          </span>

          {/* Clear button */}
          {entries.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearSession(agent.session);
              }}
              className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Expand/collapse */}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Preview when collapsed */}
      {!isExpanded && lastEntry && (
        <div className="px-4 pb-3 -mt-1">
          <div className="text-xs text-muted-foreground font-mono truncate">
            <span className={getEntryTypeColor(lastEntry.entry_type)}>
              [{lastEntry.entry_type}]
            </span>{' '}
            {lastEntry.preview || lastEntry.message.slice(0, 100)}
          </div>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border">
          {entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No output yet</p>
              <p className="text-xs">Messages will appear here in real-time</p>
            </div>
          ) : (
            <LiveMessageList entries={entries} />
          )}
        </div>
      )}
    </div>
  );
};

function getEntryTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'user':
      return 'text-blue-400';
    case 'assistant':
      return 'text-purple-400';
    case 'tool_use':
      return 'text-cyan-400';
    case 'tool_result':
      return 'text-emerald-400';
    case 'system':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}
