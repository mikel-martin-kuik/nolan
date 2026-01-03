import React from 'react';
import { HistoryEntry, AGENT_TEXT_COLORS, AgentName } from '../../types';

interface LogEntryProps {
  entry: HistoryEntry;
}

export const LogEntry: React.FC<LogEntryProps> = ({ entry }) => {
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

  // Get agent color
  const getAgentColor = (agent: string | null) => {
    if (!agent) return 'text-gray-400';
    const agentName = agent.toLowerCase() as AgentName;
    return AGENT_TEXT_COLORS[agentName] || 'text-gray-400';
  };

  // Get entry type color
  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'user':
        return 'text-blue-400';
      case 'assistant':
        return 'text-green-400';
      case 'system':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="flex gap-3 py-1 px-2 hover:bg-gray-800/50 font-mono text-sm">
      {/* Timestamp */}
      <span className="text-gray-500 shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Agent */}
      {entry.agent && (
        <span className={`${getAgentColor(entry.agent)} font-semibold shrink-0 w-16`}>
          [{entry.agent.toUpperCase()}]
        </span>
      )}

      {/* Entry Type */}
      <span className={`${getTypeColor(entry.entry_type)} shrink-0`}>
        {entry.entry_type}:
      </span>

      {/* Message */}
      <span className="text-gray-300 break-words flex-1">
        {entry.message}
      </span>
    </div>
  );
};
