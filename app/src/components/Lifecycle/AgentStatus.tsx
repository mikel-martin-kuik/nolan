import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusIndicator } from '../shared/StatusIndicator';
import { AGENT_DESCRIPTIONS, AGENT_COLORS } from '../../types';
import type { AgentStatus as AgentStatusType } from '../../types';

interface AgentStatusProps {
  agents: AgentStatusType[];
}

export const AgentStatus: React.FC<AgentStatusProps> = ({ agents }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Core Team Status</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const colorClass = AGENT_COLORS[agent.name as keyof typeof AGENT_COLORS] || 'bg-gray-500';
          const description = AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || agent.name;

          return (
            <div
              key={agent.name}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
            >
              {/* Header with status indicator */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${colorClass}`} />
                  <h3 className="font-semibold text-white capitalize">{agent.name}</h3>
                </div>
                <StatusIndicator active={agent.active} size="md" />
              </div>

              {/* Description */}
              <p className="text-sm text-gray-400 mb-2">{description}</p>

              {/* Session info */}
              <div className="text-xs text-gray-500 space-y-1">
                <div>Session: <span className="text-gray-300 font-mono">{agent.session}</span></div>
                {agent.active && (
                  <div className="flex items-center gap-2">
                    <span>Attached:</span>
                    <span className={agent.attached ? 'text-green-400' : 'text-yellow-400'}>
                      {agent.attached ? 'Yes' : 'No'}
                    </span>
                  </div>
                )}
              </div>

              {/* Open Terminal button */}
              {agent.active && (
                <button
                  onClick={async () => {
                    try {
                      await invoke('open_agent_terminal', { session: agent.session });
                    } catch (error) {
                      alert(`Failed to open terminal: ${error}`);
                    }
                  }}
                  className="mt-2 w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Open Terminal
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
