import React from 'react';
import { HistoryEntry } from '../../types';
import { RE_TEAM_SESSION, parseRalphSession } from '@/lib/agentIdentity';

interface LogEntryProps {
  entry: HistoryEntry;
  onSelect?: () => void;
  isSelected?: boolean;
}

export const LogEntry: React.FC<LogEntryProps> = ({ entry, onSelect, isSelected }) => {
  // Timestamp is already formatted as HH:MM:SS from backend, just display it
  const formatTimestamp = (timestamp: string) => {
    // If already in HH:MM:SS format, return as-is
    if (/^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      return timestamp;
    }
    // Otherwise try to parse as date
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  // Parse agent name and instance number from session name
  // Uses centralized patterns from agentIdentity.ts
  const parseAgentName = (agent: string | null) => {
    if (!agent) return { displayName: null, agentName: null };

    // Check for Ralph session first: agent-ralph-{name}
    const ralphName = parseRalphSession(agent);
    if (ralphName) {
      return {
        displayName: `RALPH-${ralphName.toUpperCase()}`,
        agentName: 'ralph'
      };
    }

    // Team-scoped spawned: agent-{team}-{name}-{instance} (e.g., agent-default-ana-2)
    // Team and agent names use underscores, hyphens are delimiters only
    const teamSpawnedMatch = agent.match(/^agent-([a-z][a-z0-9_]*)-([a-z][a-z0-9_]*)-(\d+)$/);
    if (teamSpawnedMatch) {
      const agentName = teamSpawnedMatch[2];
      const instanceNumber = teamSpawnedMatch[3];
      return {
        displayName: `${agentName.toUpperCase()}${instanceNumber}`,
        agentName: agentName
      };
    }

    // Team-scoped core: agent-{team}-{name} (e.g., agent-default-ana, agent-decision_logging-dl_coordinator)
    const teamCoreMatch = agent.match(RE_TEAM_SESSION);
    if (teamCoreMatch) {
      const agentName = teamCoreMatch[2];
      return {
        displayName: agentName.toUpperCase(),
        agentName: agentName
      };
    }

    // Fallback: use agent name as-is
    const normalizedName = agent.toLowerCase();
    return {
      displayName: agent.toUpperCase(),
      agentName: normalizedName
    };
  };

  const { displayName } = parseAgentName(entry.agent ?? null);

  // Get entry type styling
  const getTypeStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'user':
        return { color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'USER' };
      case 'assistant':
        return { color: 'text-purple-500 dark:text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', label: 'AI' };
      case 'tool_use':
        return { color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', label: 'TOOL' };
      case 'tool_result':
        return { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'RESULT' };
      case 'system':
        return { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'SYS' };
      case 'error':
        return { color: 'text-red-500 dark:text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'ERR' };
      default:
        return { color: 'text-muted-foreground', bg: 'bg-secondary/50', border: 'border-border', label: type.toUpperCase() };
    }
  };

  // Format token numbers
  const formatTokenNumber = (n: number) => {
    if (n === 0) return '0';
    if (n > 999) return `${(n/1000).toFixed(1)}k`;
    return n.toString();
  };

  const typeStyle = getTypeStyle(entry.entry_type);
  const type = entry.entry_type.toLowerCase();
  const hasTokens = entry.tokens && (entry.tokens.input > 0 || entry.tokens.output > 0);

  // Skip empty messages
  if (!entry.message || entry.message.trim() === '') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Main log entry card */}
      <div
        className={`flex items-center gap-2 py-1 px-3 hover:bg-accent text-sm cursor-pointer select-none rounded-lg flex-1 ${typeStyle.bg} ${isSelected ? 'ring-1 ring-primary/30' : ''}`}
        onClick={onSelect}
      >
        {/* Agent */}
        {displayName && (
          <span className="text-foreground font-semibold shrink-0 text-[10px] w-12">
            {displayName}
          </span>
        )}

        {/* Timestamp */}
        <span className="text-muted-foreground shrink-0 text-[11px] font-mono tabular-nums">
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Type badge - fixed width for consistency */}
        <span className={`${typeStyle.color} ${typeStyle.border} border shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded w-14 text-center`}>
          {type === 'tool_use' && entry.tool_name ? entry.tool_name.toUpperCase().slice(0, 6) : typeStyle.label}
        </span>

        {/* Message - always truncated, click to see full */}
        <span className="text-foreground/80 flex-1 font-mono text-[11px] truncate">
          {entry.message}
        </span>
      </div>

      {/* Token numbers - outside card, fixed width */}
      {hasTokens ? (
        <>
          <span className="text-[9px] text-muted-foreground shrink-0 font-mono w-7 text-right tabular-nums">
            {formatTokenNumber(entry.tokens!.input)}
          </span>
          <span className="text-[9px] text-muted-foreground shrink-0 font-mono w-7 text-right tabular-nums">
            {formatTokenNumber(entry.tokens!.output)}
          </span>
        </>
      ) : (
        <>
          <span className="text-[9px] text-transparent shrink-0 font-mono w-7 text-right">0</span>
          <span className="text-[9px] text-transparent shrink-0 font-mono w-7 text-right">0</span>
        </>
      )}
    </div>
  );
};
