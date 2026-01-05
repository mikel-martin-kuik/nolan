import React, { useEffect, useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useToastStore } from '../../store/toastStore';
import { AgentCard } from '../shared/AgentCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../ui/tooltip';
import { Users, Terminal, Play, XCircle, Plus, LayoutGrid, ArrowRight, ArrowDown } from 'lucide-react';
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
    killAllInstances,
    loading,
    setupEventListeners
  } = useAgentStore();
  const { error: showError } = useToastStore();

  // Confirmation dialog states
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [showKillRalphDialog, setShowKillRalphDialog] = useState(false);

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

  // Handler for killing all Ralph instances
  const handleKillAllRalph = () => {
    setShowKillRalphDialog(true);
  };

  const handleConfirmKillRalph = async () => {
    try {
      await killAllInstances('ralph');
    } catch (error) {
      console.error('Failed to kill Ralph instances:', error);
      showError(`Failed to kill Ralph instances: ${error}`);
    }
  };

  // Handler for opening all Ralph terminals
  const handleOpenAllRalphTerminals = async () => {
    try {
      // Get all Ralph sessions (core + spawned)
      const ralphSessions = [
        ...coreAgents.filter(a => a.name === 'ralph' && a.active).map(a => a.session),
        ...spawnedSessions.filter(s => s.session.startsWith('agent-ralph-')).map(s => s.session)
      ];

      if (ralphSessions.length === 0) {
        showError('No Ralph agents are running');
        return;
      }

      // Open terminal for each Ralph session
      for (const session of ralphSessions) {
        try {
          await invoke('open_agent_terminal', { session });
        } catch (terminalError) {
          console.error(`Failed to open terminal for ${session}:`, terminalError);
        }
      }
    } catch (error) {
      console.error('Failed to open Ralph terminals:', error);
      showError(`Failed to open Ralph terminals: ${error}`);
    }
  };

  return (
    <div className="h-full flex justify-center">
      <div className="w-full max-w-[1600px] flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
            Organization
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor all your available agents
          </p>

          {/* Organization Control Buttons */}
          <div className="flex gap-1.5 mt-4">
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

        {/* Scrum Master - Dan (Coordinator) */}
        <div>
            <div className="flex justify-center">
              <div className="w-full max-w-[260px]">
                {coreAgents.filter(a => a.name === 'dan').map((agent) => (
                  <AgentCard
                    key={agent.name}
                    agent={agent}
                    variant="dashboard"
                    showActions={true}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Arrow separator */}
          <div className="flex justify-center py-6">
            <ArrowDown className="w-6 h-6 text-primary/40" />
          </div>

          {/* Workflow Agents */}
          <div>
            <div className="flex flex-wrap justify-center gap-4 lg:gap-12">
              {['ana', 'bill', 'enzo', 'carl'].map((agentName, index) => {
                const agent = coreAgents.find(a => a.name === agentName);
                return agent ? (
                  <React.Fragment key={agent.name}>
                    <div className="w-full sm:w-[260px] flex-shrink-0">
                      <AgentCard
                        agent={agent}
                        variant="dashboard"
                        showActions={true}
                      />
                    </div>
                    {index < 3 && (
                      <div className="hidden lg:flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-6 h-6 text-primary/40" />
                      </div>
                    )}
                  </React.Fragment>
                ) : null;
              })}
            </div>
          </div>

          {/* Ralph - Free Agent */}
          <div className="mt-auto pt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-3 flex-1">
                <div className="h-px flex-1 bg-border/50" />
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/30 border border-border/40">
                  <Users className="w-3.5 h-3.5" />
                  <span>Free Agents</span>
                  {spawnedSessions.filter(s => s.session.startsWith('agent-ralph-')).length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {1 + spawnedSessions.filter(s => s.session.startsWith('agent-ralph-')).length}
                    </span>
                  )}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              {/* Free Agent Control Buttons */}
              <div className="flex gap-1.5 ml-4">
                <Tooltip content="Kill All" side="top">
                  <button
                    onClick={handleKillAllRalph}
                    disabled={loading || (!coreAgents.some(a => a.name === 'ralph' && a.active) && spawnedSessions.filter(s => s.session.startsWith('agent-ralph-')).length === 0)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center
                      bg-secondary/50 border border-border text-muted-foreground
                      hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-500
                      active:scale-95 transition-all duration-200
                      disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-muted-foreground"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip content="Terminals" side="top">
                  <button
                    onClick={handleOpenAllRalphTerminals}
                    disabled={loading || (!coreAgents.some(a => a.name === 'ralph' && a.active) && spawnedSessions.filter(s => s.session.startsWith('agent-ralph-')).length === 0)}
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
            <div className="flex flex-wrap justify-center gap-4">
              {/* Core Ralph */}
              {coreAgents.filter(a => a.name === 'ralph').map((agent) => (
                <div key={agent.name} className="w-full sm:w-[260px] flex-shrink-0">
                  <AgentCard
                    agent={agent}
                    variant="dashboard"
                    showActions={true}
                  />
                </div>
              ))}

              {/* Spawned Ralph instances */}
              {spawnedWithInstances
                .filter(agent => agent.session.startsWith('agent-ralph-'))
                .map((agent) => (
                  <div key={agent.session} className="w-full sm:w-[260px] flex-shrink-0">
                    <AgentCard
                      agent={agent}
                      variant="dashboard"
                      instanceNumber={agent.instanceNumber}
                    />
                  </div>
                ))}

              {/* Spawn Ralph Button */}
              <div className="w-full sm:w-[260px] flex-shrink-0">
                <button
                  onClick={() => handleSpawnAgent('ralph')}
                  disabled={loading}
                  className="w-full min-h-[160px] transition-all duration-200 rounded-xl backdrop-blur-sm
                    cursor-pointer active:scale-[0.98]
                    bg-card/60 border border-dashed border-border/60
                    hover:bg-card/80 hover:border-purple-400/40
                    disabled:opacity-30 disabled:cursor-not-allowed
                    flex items-center justify-center"
                  aria-label="Spawn new Ralph instance"
                >
                  <Plus className="w-8 h-8 text-foreground/50" />
                </button>
              </div>
            </div>
          </div>

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

      {/* Kill All Ralph confirmation dialog */}
      <ConfirmDialog
        open={showKillRalphDialog}
        onOpenChange={setShowKillRalphDialog}
        title="Kill All Free Agents"
        description="This will terminate all Ralph instances (core and spawned). Are you sure?"
        confirmLabel="Kill All"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKillRalph}
        variant="destructive"
      />
    </div>
  );
};
