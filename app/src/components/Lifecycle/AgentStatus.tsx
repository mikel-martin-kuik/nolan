import React from 'react';
import { AgentCard } from '../shared/AgentCard';
import type { AgentStatus as AgentStatusType } from '../../types';

interface AgentStatusProps {
  agents: AgentStatusType[];
}

export const AgentStatus: React.FC<AgentStatusProps> = ({ agents }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Core Team Status</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            variant="lifecycle"
            showActions={true}
          />
        ))}
      </div>
    </div>
  );
};
