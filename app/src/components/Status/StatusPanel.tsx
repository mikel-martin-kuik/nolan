import React, { useEffect, useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useToastStore } from '../../store/toastStore';
import { AgentCard } from '../shared/AgentCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../ui/tooltip';
import { Users, Terminal, Play, XCircle, Plus, LayoutGrid } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AGENT_COLORS, AGENT_DESCRIPTIONS } from '@/types';
import type { AgentName } from '@/types';

export const StatusPanel: React.FC = () => {
  const {
    coreAgents,
    spawnedSessions,
    updateStatus,
    launchCore,
    killCore,
    spawnAgent,
    loading,
    setupEventListeners
  } = useAgentStore();
  const { error: showError } = useToastStore();

  // Spawn agent selector state
  const [showSpawnSelector, setShowSpawnSelector] = useState(false);

  // Confirmation dialog states
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [showKillDialog, setShowKillDialog] = useState(false);

  // Setup event listeners and auto-refresh status
  useEffect(() => {
    updateStatus();
    setupEventListeners();

    // Still poll every 2s as fallback, but events will provide real-time updates
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);
    return () => {
      clearInterval(interval);
      // Note: Don't cleanup listeners here - they persist for app lifetime
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - run once on mount

  // Compute button states
  const allCoreActive = coreAgents.every(agent => agent.active);
  const anyCoreActive = coreAgents.some(agent => agent.active);

  // Extract instance numbers from spawned sessions for display
  const spawnedWithInstances = spawnedSessions.map(agent => {
    const match = agent.session.match(/^agent-[a-z]+-([0-9]+)$/);
    const instanceNumber = match ? parseInt(match[1], 10) : undefined;
    return { ...agent, instanceNumber };
  });


  // Handler functions
  const handleLaunchCoreClick = () => {
    setShowLaunchDialog(true);
  };

  const handleConfirmLaunch = async () => {
    try {
      await launchCore();

      // Open team terminals after successful launch
      // Event-driven updates will refresh status
      try {
        await invoke('open_core_team_terminals');
      } catch (terminalError) {
        console.error('Failed to open team terminals:', terminalError);
        // Non-fatal - agents are still launched
      }
    } catch (error) {
      console.error('Failed to launch core team:', error);
      showError(`Failed to launch core team: ${error}`);
    }
  };

  const handleKillCoreClick = () => {
    setShowKillDialog(true);
  };

  const handleConfirmKill = async () => {
    try {
      await killCore();
    } catch (error) {
      console.error('Failed to kill core team:', error);
      showError(`Failed to kill core team: ${error}`);
    }
  };

  const handleShowTerminals = async () => {
    try {
      await invoke('open_core_team_terminals');
    } catch (error) {
      console.error('Failed to open team terminals:', error);
      showError(`Failed to open terminals: ${error}`);
    }
  };

  // Handler for spawning any agent type
  const handleSpawnAgent = async (agentName: AgentName) => {
    setShowSpawnSelector(false);
    try {
      await spawnAgent(agentName, false);

      // Wait for status update via event-driven refresh
      // Poll for new session with timeout
      const maxAttempts = 10;
      const pollInterval = 100; // ms
      let newSession: string | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        // Refresh status to get latest sessions
        await updateStatus();

        // Get fresh spawned sessions from store
        const { spawnedSessions: currentSessions } = useAgentStore.getState();
        const agentSessions = currentSessions.filter(agent =>
          agent.session.startsWith(`agent-${agentName}-`)
        );

        if (agentSessions.length > 0) {
          // Get most recent (highest instance number)
          const sorted = agentSessions.sort((a, b) => {
            const numA = parseInt(a.session.match(new RegExp(`agent-${agentName}-(\\d+)`))?.[1] || '0', 10);
            const numB = parseInt(b.session.match(new RegExp(`agent-${agentName}-(\\d+)`))?.[1] || '0', 10);
            return numB - numA;
          });
          newSession = sorted[0].session;
          break;
        }
      }

      if (newSession) {
        try {
          await invoke('open_agent_terminal', { session: newSession });
        } catch (terminalError) {
          console.error('Failed to open terminal:', terminalError);
        }
      } else {
        console.warn(`Spawned session for ${agentName} not found after polling`);
      }
    } catch (error) {
      console.error(`Failed to spawn ${agentName}:`, error);
    }
  };

  // Available agents for spawning (all 6)
  const spawnableAgents: AgentName[] = ['ana', 'bill', 'carl', 'dan', 'enzo', 'ralph'];

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor all your available agents
          </p>
        </div>

        {/* Core Team Status */}
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground">Core Team Status</h2>
            </div>
            <div className="flex gap-1.5">
              <Tooltip content="Launch" side="bottom">
                <button
                  onClick={handleLaunchCoreClick}
                  disabled={loading || allCoreActive}
                  className="w-9 h-9 rounded-xl flex items-center justify-center
                    bg-secondary/50 border border-border text-muted-foreground
                    hover:bg-emerald-500/10 hover:border-emerald-400/20 hover:text-emerald-500
                    active:scale-95 transition-all duration-200
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                >
                  <Play className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="Kill" side="bottom">
                <button
                  onClick={handleKillCoreClick}
                  disabled={loading || !anyCoreActive}
                  className="w-9 h-9 rounded-xl flex items-center justify-center
                    bg-secondary/50 border border-border text-muted-foreground
                    hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-500
                    active:scale-95 transition-all duration-200
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="Terminals" side="bottom">
                <button
                  onClick={handleShowTerminals}
                  disabled={loading || !anyCoreActive}
                  className="w-9 h-9 rounded-xl flex items-center justify-center
                    bg-secondary/50 border border-border text-muted-foreground
                    hover:bg-accent hover:border-border hover:text-foreground
                    active:scale-95 transition-all duration-200
                    disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </Tooltip>
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

            {/* Empty spacer for grid alignment */}
            <div className="hidden lg:block" />

            {/* Spawn Agent Button - ultra minimal, centered below Enzo */}
            <div className="relative col-span-1 md:col-start-1 lg:col-start-2">
              <Tooltip content="Spawn" side="bottom">
                <button
                  onClick={() => setShowSpawnSelector(!showSpawnSelector)}
                  disabled={loading}
                  className="w-full h-12 rounded-xl flex items-center justify-center
                    bg-card/20 border border-dashed border-border opacity-60
                    text-muted-foreground
                    hover:opacity-80 hover:border-purple-400/40 hover:bg-purple-500/5
                    active:scale-[0.98] transition-all duration-200
                    disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Spawn new agent instance"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </Tooltip>

              {/* Agent selection dropdown */}
              {showSpawnSelector && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-popover/95 backdrop-blur-xl border border-border rounded-2xl shadow-xl z-50">
                  <div className="p-2">
                    <div className="text-xs text-muted-foreground px-3 py-2 border-b border-border mb-2">
                      Select agent to spawn
                    </div>
                    {spawnableAgents.map((agentName) => (
                      <button
                        key={agentName}
                        onClick={() => handleSpawnAgent(agentName)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-xl text-left"
                      >
                        <div
                          className={`w-3 h-3 rounded-full ${AGENT_COLORS[agentName as keyof typeof AGENT_COLORS] || 'bg-gray-500'}`}
                        />
                        <div>
                          <span className="text-foreground capitalize font-medium">{agentName}</span>
                          <p className="text-xs text-muted-foreground">
                            {AGENT_DESCRIPTIONS[agentName as keyof typeof AGENT_DESCRIPTIONS] || ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Spawned Agents Status - only show when there are spawned sessions */}
        {spawnedSessions.length > 0 && (
          <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-purple-500" />
              <h2 className="text-base font-semibold text-foreground">Spawned Agents Status</h2>
              <span className="text-sm text-muted-foreground">({spawnedSessions.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {spawnedWithInstances.map((agent) => (
                <AgentCard
                  key={agent.session}
                  agent={agent}
                  variant="dashboard"
                  instanceNumber={agent.instanceNumber}
                />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Launch Core confirmation dialog */}
      <ConfirmDialog
        open={showLaunchDialog}
        onOpenChange={setShowLaunchDialog}
        title="Launch Core Team"
        description="Launch all 6 core team agents (Ana, Bill, Carl, Dan, Enzo, Ralph)? This will start agents and open the team terminal grid."
        confirmLabel="Launch"
        cancelLabel="Cancel"
        onConfirm={handleConfirmLaunch}
      />

      {/* Kill Core confirmation dialog */}
      <ConfirmDialog
        open={showKillDialog}
        onOpenChange={setShowKillDialog}
        title="Kill All Core Agents"
        description="This will terminate all running core agents (Ana, Bill, Carl, Dan, Enzo, Ralph). Spawned instances will not be affected. Are you sure?"
        confirmLabel="Kill All"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKill}
        variant="destructive"
      />
    </div>
  );
};
