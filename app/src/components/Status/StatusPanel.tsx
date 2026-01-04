import React, { useEffect, useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { AgentCard } from '../shared/AgentCard';
import { Button } from '@/components/ui/button';
import { Activity, Users, Terminal, Clock, Play, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const StatusPanel: React.FC = () => {
  const {
    coreAgents,
    spawnedSessions,
    updateStatus,
    launchCore,
    killCore,
    spawnAgent,
    loading
  } = useAgentStore();

  // Spawned sessions expansion state
  const [showAllSpawned, setShowAllSpawned] = useState(false);

  // Auto-refresh status
  useEffect(() => {
    updateStatus();
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [updateStatus]);

  // Reset expansion when sessions change
  useEffect(() => {
    // Only collapse if currently expanded and now <= 6
    if (showAllSpawned && spawnedSessions.length <= 6) {
      setShowAllSpawned(false);
    }
  }, [spawnedSessions.length, showAllSpawned]);

  // Calculate stats
  const activeAgents = coreAgents.filter(a => a.active).length;
  const totalAgents = coreAgents.length;

  // Compute button states
  const allCoreActive = coreAgents.every(agent => agent.active);
  const anyCoreActive = coreAgents.some(agent => agent.active);

  // Parse spawned sessions for AgentCard display
  const parsedSpawnedSessions = spawnedSessions
    .map(session => {
      const match = session.match(/^agent-([a-z]+)-([0-9]+)$/);
      if (!match) return null;

      const [, name, instanceNum] = match;

      return {
        name,
        active: true,
        session,
        attached: false,
        instanceNumber: parseInt(instanceNum, 10)
      };
    })
    .filter((agent): agent is { name: string; active: boolean; session: string; attached: boolean; instanceNumber: number } => agent !== null)
    .sort((a, b) => {
      // Sort by name first, then instance number
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.instanceNumber - b.instanceNumber;
    });

  // Ralph-specific state
  const ralphInstances = spawnedSessions
    .filter(session => session.startsWith('agent-ralph-'))
    .sort((a, b) => {
      // Sort by instance number descending (highest = most recent)
      const numA = parseInt(a.match(/agent-ralph-(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/agent-ralph-(\d+)/)?.[1] || '0', 10);
      return numB - numA;
    });
  const hasRalphInstances = ralphInstances.length > 0;
  const mostRecentRalph = ralphInstances[0] || null;

  // Handler functions
  const handleLaunchCore = async () => {
    // Confirmation dialog
    const confirmed = window.confirm(
      'Launch all 5 core team agents (Ana, Bill, Carl, Dan, Enzo)?\n\n' +
      'This will start agents and open the team terminal grid.'
    );

    if (!confirmed) return;

    try {
      await launchCore();

      // Open team terminals after successful launch
      // Wait 2 seconds for sessions to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await invoke('open_core_team_terminals');
      } catch (terminalError) {
        console.error('Failed to open team terminals:', terminalError);
        // Non-fatal - agents are still launched
      }
    } catch (error) {
      console.error('Failed to launch core team:', error);
    }
  };

  const handleKillCore = async () => {
    // Strong warning confirmation
    const confirmed = window.confirm(
      '⚠️ WARNING: Kill all core team agents?\n\n' +
      'This will terminate all running core agents (Ana, Bill, Carl, Dan, Enzo).\n' +
      'Spawned instances will not be affected.\n\n' +
      'Are you sure?'
    );

    if (!confirmed) return;

    try {
      await killCore();
    } catch (error) {
      console.error('Failed to kill core team:', error);
    }
  };

  const handleSpawnRalph = async () => {
    try {
      await spawnAgent('ralph', false);

      // Wait for session to be created
      await new Promise(resolve => setTimeout(resolve, 500));
      await updateStatus();

      // Open terminal for most recent Ralph instance
      const ralphSessions = spawnedSessions.filter(session =>
        session.startsWith('agent-ralph-')
      );

      if (ralphSessions.length > 0) {
        // Get most recent (highest instance number)
        const sorted = ralphSessions.sort((a, b) => {
          const numA = parseInt(a.match(/agent-ralph-(\d+)/)?.[1] || '0', 10);
          const numB = parseInt(b.match(/agent-ralph-(\d+)/)?.[1] || '0', 10);
          return numB - numA;
        });
        const newSession = sorted[0];

        try {
          await invoke('open_agent_terminal', { session: newSession });
        } catch (terminalError) {
          console.error('Failed to open terminal:', terminalError);
          // Non-fatal - agent is still spawned
        }
      }
    } catch (error) {
      console.error('Failed to spawn Ralph:', error);
    }
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Core Team Status</h2>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleLaunchCore}
                disabled={loading || allCoreActive}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Launch Core
              </Button>
              <Button
                onClick={handleKillCore}
                disabled={loading || !anyCoreActive}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <XCircle className="w-4 h-4" />
                Kill Core
              </Button>
            </div>
          </div>
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-green-400" />
                <h2 className="text-xl font-semibold text-white">Spawned Sessions</h2>
                <span className="text-sm text-gray-400">({spawnedSessions.length})</span>
              </div>
              {spawnedSessions.length > 6 && (
                <Button
                  onClick={() => setShowAllSpawned(!showAllSpawned)}
                  variant="outline"
                  size="sm"
                >
                  {showAllSpawned ? 'Show Less' : `Show All (${spawnedSessions.length})`}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {parsedSpawnedSessions.slice(0, showAllSpawned ? undefined : 6).map((parsed) => (
                <AgentCard
                  key={parsed.session}
                  agent={{
                    name: parsed.name,
                    active: parsed.active,
                    session: parsed.session,
                    attached: parsed.attached
                  }}
                  variant="spawned"
                  instanceNumber={parsed.instanceNumber}
                />
              ))}
            </div>

            {!showAllSpawned && spawnedSessions.length > 6 && (
              <div className="mt-4 text-center">
                <Button
                  onClick={() => setShowAllSpawned(true)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white"
                >
                  + {spawnedSessions.length - 6} more sessions
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Ralph Agent Card */}
        {hasRalphInstances ? (
          // Collapsed placeholder state
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-zinc-400" />
                <h2 className="text-xl font-semibold text-white">Ralph Agent</h2>
              </div>
              <Button
                onClick={handleSpawnRalph}
                disabled={loading}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Spawn New
              </Button>
            </div>

            {/* Placeholder with most recent instance */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={handleSpawnRalph}
                disabled={loading}
                className="bg-gray-900/50 border-2 border-dashed border-gray-600 rounded-lg p-6
                           hover:border-gray-500 hover:bg-gray-900/70 transition-all
                           flex items-center justify-center gap-2 min-h-[120px]
                           disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Spawn new Ralph instance"
              >
                <Play className="w-8 h-8 text-gray-400" />
                <span className="text-gray-400 font-medium">Spawn New Ralph</span>
              </button>

              {/* Show most recent Ralph instance if exists */}
              {mostRecentRalph && (
                <AgentCard
                  key={mostRecentRalph}
                  agent={{
                    name: 'ralph',
                    active: true,
                    session: mostRecentRalph,
                    attached: false
                  }}
                  variant="spawned"
                  instanceNumber={parseInt(mostRecentRalph.match(/agent-ralph-(\d+)/)?.[1] || '0', 10)}
                />
              )}
            </div>
          </div>
        ) : (
          // Full spawn card state
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-zinc-400" />
              <h2 className="text-xl font-semibold text-white">Ralph Agent</h2>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Ralph is a dummy agent for testing. Spawn instances as needed.
              </p>

              <Button
                onClick={handleSpawnRalph}
                disabled={loading}
                variant="default"
                className="w-full gap-2"
              >
                <Play className="w-4 h-4" />
                {loading ? 'Spawning...' : 'Spawn Ralph Instance'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
