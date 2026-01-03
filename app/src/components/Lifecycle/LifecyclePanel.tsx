import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAgentStore } from '../../store/agentStore';
import { AgentStatus } from './AgentStatus';
import { SpawnControls } from './SpawnControls';
import { SessionList } from './SessionList';
import { Button } from '../shared/Button';

export const LifecyclePanel: React.FC = () => {
  const {
    coreAgents,
    spawnedSessions,
    loading,
    error,
    lastUpdate,
    updateStatus,
    launchCore,
    killCore,
    clearError,
  } = useAgentStore();

  // Auto-refresh every 2 seconds
  useEffect(() => {
    // Initial fetch
    updateStatus();

    // Set up polling interval
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, [updateStatus]);

  const handleLaunchCore = async () => {
    if (window.confirm('Launch all core team agents (Ana, Bill, Carl, Dan, Enzo)?')) {
      try {
        await launchCore();
        // Wait for sessions to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Auto-open terminals
        await invoke('open_core_team_terminals');
      } catch (error) {
        console.error('Error launching core team:', error);
        // Error already handled by store
      }
    }
  };

  const handleOpenTeamTerminals = async () => {
    try {
      await invoke('open_core_team_terminals');
    } catch (error) {
      alert(`Error: ${error}`);
    }
  };

  const handleKillCore = async () => {
    if (window.confirm('⚠️ Kill all core team agents? This will terminate all active sessions.')) {
      await killCore();
    }
  };

  const formatLastUpdate = () => {
    if (!lastUpdate) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 2) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return new Date(lastUpdate).toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lifecycle Manager</h1>
            <p className="text-sm text-gray-400 mt-1">
              Last updated: {formatLastUpdate()}
              {loading && <span className="ml-2 text-blue-400">Refreshing...</span>}
            </p>
          </div>

          {/* Core team controls */}
          <div className="flex gap-2">
            <Button
              onClick={handleLaunchCore}
              disabled={loading}
              variant="primary"
            >
              Launch Core Team
            </Button>
            <Button
              onClick={handleOpenTeamTerminals}
              disabled={loading}
              variant="secondary"
            >
              Open Team Terminals
            </Button>
            <Button
              onClick={handleKillCore}
              disabled={loading}
              variant="danger"
            >
              Kill Core
            </Button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-red-200">Error</h3>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-red-200 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Core team status */}
        <AgentStatus agents={coreAgents} />

        {/* Spawn controls */}
        <SpawnControls />

        {/* Active spawned sessions */}
        <SessionList sessions={spawnedSessions} />
      </div>
    </div>
  );
};
