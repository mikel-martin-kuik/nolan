import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useToastStore } from '../../store/toastStore';
import { useTeamStore } from '../../store/teamStore';
import { AgentCard } from '../shared/AgentCard';
import { TeamCard } from '../shared/TeamCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ProjectSelectModal, LaunchParams } from '../shared/ProjectSelectModal';
import { Tooltip } from '../ui/tooltip';
import { Users, Plus, XCircle, LayoutGrid } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { AgentName, ClaudeModel, TeamConfig } from '@/types';
import { getRalphDisplayName } from '@/lib/agentIdentity';
import { getTeamMembers } from '@/types';
import type { ProjectInfo } from '@/types/projects';
import { ModelSelectDialog } from '../shared/ModelSelectDialog';

export const StatusPanel: React.FC = () => {
  const {
    teamAgents,
    freeAgents,
    updateStatus,
    launchTeam,
    killTeam,
    spawnAgent,
    killAllInstances,
    loading,
    setupEventListeners
  } = useAgentStore();
  const { error: showError } = useToastStore();
  const { currentTeam, availableTeams, teamConfigs, loadAvailableTeams, loadAllTeams } = useTeamStore();

  // Track collapsed state per team (all collapsed by default)
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [teamsInitialized, setTeamsInitialized] = useState(false);

  // Get team member names from team config for dialog display
  const teamMemberNames = useMemo(() => {
    const members = getTeamMembers(currentTeam);
    // Capitalize names for display
    return members.map(name => name.charAt(0).toUpperCase() + name.slice(1)).join(', ');
  }, [currentTeam]);

  // Confirmation dialog states
  const [showProjectSelectModal, setShowProjectSelectModal] = useState(false);
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [showKillRalphDialog, setShowKillRalphDialog] = useState(false);
  const [showModelSelectDialog, setShowModelSelectDialog] = useState(false);

  // Track which team is being targeted for launch/kill operations
  const [targetTeam, setTargetTeam] = useState<string>('');

  // Projects for the launch modal
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Get visual display name for ralph (persisted fun name)
  const ralphDisplayName = getRalphDisplayName();

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
    };
  }, [updateStatus, setupEventListeners]);

  // Load all teams on mount
  useEffect(() => {
    const initTeams = async () => {
      await loadAvailableTeams();
      await loadAllTeams();
      setTeamsInitialized(true);
    };
    initTeams();
  }, [loadAvailableTeams, loadAllTeams]);

  // Initialize all teams as collapsed when teams are loaded
  useEffect(() => {
    if (teamsInitialized && availableTeams.length > 0) {
      setCollapsedTeams(new Set(availableTeams));
    }
  }, [teamsInitialized, availableTeams]);

  // Toggle collapse state for a team
  const toggleTeamCollapse = useCallback((teamName: string) => {
    setCollapsedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  }, []);

  // Get agents for a specific team
  const getAgentsForTeam = useCallback((teamConfig: TeamConfig) => {
    const teamName = teamConfig.team.name;

    // Filter teamAgents by team field (exclude ralph - it's a free agent)
    return teamAgents.filter(a => a.team === teamName && a.name !== 'ralph');
  }, [teamAgents]);


  // Extract instance identifiers from free agents for display
  // Ralph uses names (ziggy, nova)
  const freeAgentsWithInstances = freeAgents.map(agent => {
    const match = agent.session.match(/^agent-ralph-([a-z0-9]+)$/);
    const instanceId = match ? match[1] : undefined;
    return { ...agent, instanceId };
  }).sort((a, b) => {
    // Sort by creation timestamp to maintain order (oldest first)
    if (a.created_at && b.created_at) {
      return a.created_at - b.created_at;
    }
    return 0;
  });


  // Handler functions
  const handleLaunchTeamClick = async (teamName: string) => {
    // Store the target team for the launch operation
    setTargetTeam(teamName);

    // Fetch projects before showing modal
    setProjectsLoading(true);
    try {
      const projectList = await invoke<ProjectInfo[]>('list_projects');
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
    setShowProjectSelectModal(true);
  };

  const handleProjectLaunch = async (params: LaunchParams) => {
    try {
      const { projectName, isNew, initialPrompt, updatedOriginalPrompt, followupPrompt } = params;

      // If it's a new project, create it first with the target team
      if (isNew) {
        await invoke('create_project', { projectName, teamName: targetTeam });
      }

      // Launch team with project context (team-scoped)
      // For new projects: pass initialPrompt (written to prompt.md and sent to coordinator)
      // For existing projects: pass updatedOriginalPrompt (only written if modified) and followupPrompt (sent to coordinator)
      await launchTeam(targetTeam, projectName, initialPrompt, updatedOriginalPrompt, followupPrompt);

      // Open team terminals after successful launch
      try {
        await invoke('open_team_terminals', { teamName: targetTeam });
      } catch (terminalError) {
        console.error('Failed to open team terminals:', terminalError);
        // Non-fatal - agents are still launched
      }
    } catch (error) {
      console.error('Failed to launch team:', error);
      showError(`Failed to launch team: ${error}`);
    }
  };

  const handleKillTeamClick = (teamName: string) => {
    setTargetTeam(teamName);
    setShowKillDialog(true);
  };

  const handleConfirmKill = async () => {
    try {
      await killTeam(targetTeam);
    } catch (error) {
      console.error('Failed to kill team:', error);
      showError(`Failed to kill team: ${error}`);
    }
  };

  const handleShowTerminals = async (teamName: string) => {
    try {
      await invoke('open_team_terminals', { teamName });
    } catch (error) {
      console.error('Failed to open team terminals:', error);
      showError(`Failed to open terminals: ${error}`);
    }
  };

  // Handler for spawning any agent type (team-scoped)
  const handleSpawnAgent = async (teamName: string, agentName: AgentName, model?: ClaudeModel) => {
    try {
      // Capture existing sessions BEFORE spawning to detect the new one
      const { freeAgents: beforeFreeAgents, teamAgents: beforeTeamAgents } = useAgentStore.getState();
      // For team-scoped sessions: agent-{team}-{name}-{instance}
      // For free agents (ralph): agent-ralph-{instance}
      const sessionPrefix = agentName === 'ralph' ? 'agent-ralph-' : `agent-${teamName}-${agentName}-`;
      const beforeSessions = agentName === 'ralph' ? beforeFreeAgents : beforeTeamAgents;
      const existingSessionNames = new Set(
        beforeSessions
          .filter(s => s.session.startsWith(sessionPrefix))
          .map(s => s.session)
      );

      await spawnAgent(teamName, agentName, false, model);

      // Poll for new session with timeout
      const maxAttempts = 10;
      const pollInterval = 100; // ms
      let newSession: string | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        // Refresh status to get latest sessions
        try {
          await updateStatus();
        } catch (error) {
          console.error(`Failed to update status on attempt ${attempt}:`, error);
          continue;
        }

        // Get fresh sessions from store
        const { freeAgents: currentFreeAgents, teamAgents: currentTeamAgents } = useAgentStore.getState();
        const currentSessions = agentName === 'ralph' ? currentFreeAgents : currentTeamAgents;
        const agentSessions = currentSessions.filter(agent =>
          agent.session.startsWith(sessionPrefix)
        );

        // Find the NEW session (one that didn't exist before)
        const newSessions = agentSessions.filter(s => !existingSessionNames.has(s.session));
        if (newSessions.length > 0) {
          newSession = newSessions[0].session;
          break;
        }
      }

      // Only open terminal for non-Ralph agents (Ralph stays detached)
      if (newSession && agentName !== 'ralph') {
        try {
          await invoke('open_agent_terminal', { session: newSession });
        } catch (terminalError) {
          console.error('Failed to open terminal:', terminalError);
        }
      } else if (!newSession) {
        showError(`Failed to spawn ${agentName}: session not found after ${maxAttempts} attempts`);
      }
    } catch (error) {
      console.error(`Failed to spawn ${agentName}:`, error);
    }
  };

  // Handler for showing model select dialog for Ralph
  const handleSpawnRalphClick = () => {
    setShowModelSelectDialog(true);
  };

  // Handler for when model is selected (Ralph is team-independent)
  const handleModelSelect = (model: ClaudeModel) => {
    handleSpawnAgent('', 'ralph', model);
  };

  // Handler for killing all Ralph instances
  const handleKillAllRalph = () => {
    setShowKillRalphDialog(true);
  };

  const handleConfirmKillRalph = async () => {
    try {
      // Ralph is team-independent, use empty team name
      await killAllInstances('', 'ralph');
    } catch (error) {
      console.error(`Failed to kill ${ralphDisplayName} instances:`, error);
      showError(`Failed to kill ${ralphDisplayName} instances: ${error}`);
    }
  };

  // Handler for opening all Ralph terminals
  const handleOpenAllRalphTerminals = async () => {
    try {
      // Get all Ralph sessions (from free agents)
      const ralphSessions = freeAgents
        .filter(a => a.name === 'ralph' && a.active)
        .map(a => a.session);

      if (ralphSessions.length === 0) {
        showError(`No ${ralphDisplayName} agents are running`);
        return;
      }

      // Open terminal for each session
      for (const session of ralphSessions) {
        try {
          await invoke('open_agent_terminal', { session });
        } catch (terminalError) {
          console.error(`Failed to open terminal for ${session}:`, terminalError);
        }
      }
    } catch (error) {
      console.error(`Failed to open ${ralphDisplayName} terminals:`, error);
      showError(`Failed to open ${ralphDisplayName} terminals: ${error}`);
    }
  };

  return (
    <div className="h-full">
      <div className="w-full h-full flex flex-col">
        {/* Teams Grid */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {availableTeams.map(teamName => {
            const teamConfig = teamConfigs.get(teamName);
            if (!teamConfig) return null;

            const teamAgents = getAgentsForTeam(teamConfig);
            const isCollapsed = collapsedTeams.has(teamName);

            return (
              <TeamCard
                key={teamName}
                teamName={teamConfig.team.name || teamName}
                teamConfig={teamConfig}
                agents={teamAgents}
                collapsed={isCollapsed}
                onToggleCollapse={() => toggleTeamCollapse(teamName)}
                showActions={true}
                loading={loading}
                onLaunch={() => handleLaunchTeamClick(teamName)}
                onKill={() => handleKillTeamClick(teamName)}
                onShowTerminals={() => handleShowTerminals(teamName)}
              />
            );
          })}
        </div>

        {/* Ralph - Free Agent */}
        <div className="mt-auto pt-8">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/30 border border-border/40">
                <Users className="w-3.5 h-3.5" />
                <span>Free Agents</span>
                {freeAgents.filter(a => a.active).length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {freeAgents.filter(a => a.active).length}
                  </span>
                )}
              </span>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            {/* Free Agent Cards with absolute buttons */}
            <div className="relative">
              {/* Free Agent Control Buttons - positioned left */}
              <div className="absolute left-0 top-0 flex gap-1.5">
                <Tooltip content="Kill All" side="bottom">
                  <button
                    onClick={handleKillAllRalph}
                    disabled={loading || freeAgents.filter(a => a.active).length === 0}
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
                    onClick={handleOpenAllRalphTerminals}
                    disabled={loading || freeAgents.filter(a => a.active).length === 0}
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

              <div className="flex flex-wrap justify-center gap-2 lg:gap-4">
              {/* Free Agent instances (Ralph) */}
              {freeAgentsWithInstances
                .filter(agent => agent.active)
                .map((agent) => (
                  <div key={agent.session} className="w-[clamp(120px,calc(70vw/2),160px)]">
                    <AgentCard
                      agent={agent}
                      variant="dashboard"
                      showActions={true}
                      instanceId={agent.instanceId}
                    />
                  </div>
                ))}

              {/* Spawn Ralph Button */}
              <div className="w-[clamp(120px,calc(70vw/2),160px)]">
                <button
                  onClick={handleSpawnRalphClick}
                  disabled={loading}
                  className="w-full h-full py-4 transition-all duration-200 rounded-xl backdrop-blur-sm
                    cursor-pointer active:scale-[0.98]
                    bg-card/60 border border-dashed border-border/60
                    hover:bg-card/80 hover:border-purple-400/40
                    disabled:opacity-30 disabled:cursor-not-allowed
                    flex items-center justify-center"
                  aria-label={`Spawn new ${ralphDisplayName} instance`}
                >
                  <Plus className="w-6 h-6 text-foreground/50" />
                </button>
              </div>
              </div>
            </div>
          </div>

      </div>

      {/* Project Select Modal for Launch */}
      <ProjectSelectModal
        open={showProjectSelectModal}
        onOpenChange={setShowProjectSelectModal}
        onLaunch={handleProjectLaunch}
        projects={projects}
        isLoading={projectsLoading || loading}
        teamName={targetTeam}
      />

      {/* Kill Team confirmation dialog */}
      <ConfirmDialog
        open={showKillDialog}
        onOpenChange={setShowKillDialog}
        title="Kill All Team Agents"
        description={`This will terminate all running team agents (${teamMemberNames}). Are you sure?`}
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
        description={`This will terminate all ${ralphDisplayName} instances. Are you sure?`}
        confirmLabel="Kill All"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKillRalph}
        variant="destructive"
      />

      {/* Model selection dialog for Ralph */}
      <ModelSelectDialog
        open={showModelSelectDialog}
        onOpenChange={setShowModelSelectDialog}
        onSelect={handleModelSelect}
      />
    </div>
  );
};
