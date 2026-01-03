import React, { useEffect } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useHistoryStore } from '../../store/historyStore';
import { AgentCard } from '../shared/AgentCard';
import { Activity, Users, Terminal, Clock } from 'lucide-react';

export const StatusPanel: React.FC = () => {
  const { coreAgents, spawnedSessions, updateStatus } = useAgentStore();
  const { entries } = useHistoryStore();

  // Auto-refresh status
  useEffect(() => {
    updateStatus();
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [updateStatus]);

  // Calculate stats
  const activeAgents = coreAgents.filter(a => a.active).length;
  const totalAgents = coreAgents.length;
  const recentEntries = entries.slice(-5).reverse();

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-400" />
            Status Dashboard
          </h1>
          <p className="text-gray-400 mt-1">
            Overview of all systems and recent activity
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Core Agents */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Core Team</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {activeAgents}/{totalAgents}
                </p>
                <p className="text-xs text-gray-500 mt-1">Active Agents</p>
              </div>
              <div className="bg-blue-500/10 p-3 rounded-lg">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </div>

          {/* Spawned Sessions */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Spawned</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {spawnedSessions.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Active Sessions</p>
              </div>
              <div className="bg-purple-500/10 p-3 rounded-lg">
                <Terminal className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Recent</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {entries.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Log Entries</p>
              </div>
              <div className="bg-green-500/10 p-3 rounded-lg">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">System</p>
                <p className="text-3xl font-bold text-green-400 mt-1">
                  Healthy
                </p>
                <p className="text-xs text-gray-500 mt-1">All Systems Go</p>
              </div>
              <div className="bg-green-500/10 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Core Team Status */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Core Team Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreAgents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                variant="dashboard"
                showActions={true}
              />
            ))}
          </div>
        </div>

        {/* Spawned Sessions */}
        {spawnedSessions.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Active Spawned Sessions ({spawnedSessions.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {spawnedSessions.map((session) => (
                <div
                  key={session}
                  className="bg-gray-900/50 border border-gray-700 rounded px-3 py-2 font-mono text-sm text-gray-300"
                >
                  {session}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </h2>
          {recentEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No recent activity</p>
              <p className="text-sm mt-1">Activity will appear here as agents interact</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                      {entry.timestamp}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-300 break-words">
                        {entry.message}
                      </div>
                      {entry.agent && (
                        <div className="text-xs text-gray-500 mt-1">
                          Agent: <span className="text-blue-400">{entry.agent}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
