import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../shared/Button';
import { useAgentStore } from '../../store/agentStore';
import { AGENT_COLORS } from '../../types';

interface SessionListProps {
  sessions: string[];
}

export const SessionList: React.FC<SessionListProps> = ({ sessions }) => {
  const { killInstance, loading } = useAgentStore();

  const handleKill = async (session: string) => {
    if (window.confirm(`Kill session: ${session}?`)) {
      await killInstance(session);
    }
  };

  const handleOpenTerminal = async (session: string) => {
    try {
      await invoke('open_agent_terminal', { session });
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  const getAgentColor = (session: string): string => {
    // Extract agent name from session (e.g., "agent-ana2" -> "ana")
    const match = session.match(/^agent-([a-z]+)/);
    if (match && match[1]) {
      const agentName = match[1];
      return AGENT_COLORS[agentName as keyof typeof AGENT_COLORS] || 'bg-gray-500';
    }
    return 'bg-gray-500';
  };

  if (sessions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white mb-4">Active Spawned Sessions</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
          <p className="text-gray-400">No spawned sessions active</p>
          <p className="text-sm text-gray-500 mt-2">
            Use the spawn controls above to create new instances
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">
        Active Spawned Sessions ({sessions.length})
      </h2>

      <div className="space-y-2">
        {sessions.map((session) => {
          const colorClass = getAgentColor(session);

          return (
            <div
              key={session}
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between hover:border-gray-600 transition-colors"
            >
              {/* Session info */}
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                <span className="font-mono text-white">{session}</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleOpenTerminal(session)}
                  disabled={loading}
                  variant="secondary"
                  size="sm"
                >
                  Open
                </Button>
                <Button
                  onClick={() => handleKill(session)}
                  disabled={loading}
                  variant="danger"
                  size="sm"
                >
                  Kill
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
