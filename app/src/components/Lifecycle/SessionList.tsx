import React from 'react';
import { AgentCard } from '../shared/AgentCard';
import type { AgentStatus as AgentStatusType } from '@/types';

interface SessionListProps {
  sessions: string[];
}

export const SessionList: React.FC<SessionListProps> = ({ sessions }) => {
  // Parse session string to create AgentStatus object
  const parseSession = (session: string): { agent: AgentStatusType; instanceNumber: number } | null => {
    // Match: agent-{name}-{number} (e.g., "agent-ana-2")
    const match = session.match(/^agent-([a-z]+)-(\d+)$/);
    if (!match) return null;

    const [, agentName, instanceNum] = match;

    return {
      agent: {
        name: agentName,
        active: true,  // Spawned sessions are always active (they exist)
        session: session,
        attached: false, // Assume detached for spawned instances
      },
      instanceNumber: parseInt(instanceNum, 10),
    };
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session) => {
          const parsed = parseSession(session);

          if (!parsed) {
            // Fallback for malformed session names
            return (
              <div
                key={session}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3"
              >
                <span className="font-mono text-gray-400">{session}</span>
              </div>
            );
          }

          return (
            <AgentCard
              key={session}
              agent={parsed.agent}
              variant="spawned"
              showActions={true}
              instanceNumber={parsed.instanceNumber}
              isSpawned={true}
            />
          );
        })}
      </div>
    </div>
  );
};
