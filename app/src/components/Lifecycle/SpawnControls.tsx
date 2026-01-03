import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../shared/Button';
import { useAgentStore } from '../../store/agentStore';
import { VALID_AGENTS, AGENT_DESCRIPTIONS } from '../../types';
import type { AgentName } from '../../types';

export const SpawnControls: React.FC = () => {
  const { updateStatus, killAllInstances, loading } = useAgentStore();
  const [selectedAgent, setSelectedAgent] = useState<AgentName>('ana');
  const [forceSpawn, setForceSpawn] = useState(false);

  const handleSpawn = async () => {
    try {
      // Call invoke directly to get the result message
      const result = await invoke<string>('spawn_agent', {
        agent: selectedAgent,
        force: forceSpawn
      });

      // Extract session name from result (e.g., "Spawned: agent-bill-2")
      const match = result.match(/agent-[a-z]+-[0-9]+/);
      if (match) {
        const session = match[0];
        // Auto-open terminal for new spawn
        try {
          await invoke('open_agent_terminal', { session });
        } catch (terminalError) {
          console.error('Failed to open terminal:', terminalError);
          // Don't fail the whole spawn if terminal opening fails
        }
      }

      // Wait for session to start, then refresh status
      await new Promise(resolve => setTimeout(resolve, 1000));
      await updateStatus();
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  const handleKillAll = async (agent: AgentName) => {
    if (window.confirm(`Kill all spawned instances of ${agent}?`)) {
      await killAllInstances(agent);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Spawn Controls</h2>

      {/* Spawn Form */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Spawn New Instance</h3>

        <div className="space-y-3">
          {/* Agent selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Select Agent
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value as AgentName)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              {VALID_AGENTS.map((agent) => (
                <option key={agent} value={agent}>
                  {agent.charAt(0).toUpperCase() + agent.slice(1)} - {AGENT_DESCRIPTIONS[agent]}
                </option>
              ))}
            </select>
          </div>

          {/* Force checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="force-spawn"
              checked={forceSpawn}
              onChange={(e) => setForceSpawn(e.target.checked)}
              className="w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="force-spawn" className="text-sm text-gray-300">
              Force spawn (override existing instance)
            </label>
          </div>

          {/* Spawn button */}
          <Button
            onClick={handleSpawn}
            disabled={loading}
            variant="primary"
            className="w-full"
          >
            {loading ? 'Spawning...' : 'Spawn Agent'}
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {VALID_AGENTS.map((agent) => (
            <Button
              key={agent}
              onClick={() => handleKillAll(agent)}
              disabled={loading}
              variant="danger"
              size="sm"
            >
              Kill {agent}*
            </Button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-2">
          * Kills all spawned instances (agent-{'{name}'}2, agent-{'{name}'}3, etc.)
        </p>
      </div>
    </div>
  );
};
