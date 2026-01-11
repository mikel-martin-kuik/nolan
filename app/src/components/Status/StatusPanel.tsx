import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useToastStore } from '../../store/toastStore';
import { useTeamStore } from '../../store/teamStore';
import { useCollapsedTeamsStore } from '../../store/collapsedTeamsStore';
import { useDepartmentStore } from '../../store/departmentStore';
import { AgentCard } from '../shared/AgentCard';
import { TeamCard } from '../shared/TeamCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ProjectSelectModal, LaunchParams } from '../shared/ProjectSelectModal';
import { Tooltip } from '../ui/tooltip';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Users, Plus, XCircle, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';
import { invoke, isBrowserMode } from '@/lib/api';
import type { AgentName, ClaudeModel, TeamConfig, SpawnOptions } from '@/types';
import { getRalphDisplayName, parseRalphSession } from '@/lib/agentIdentity';
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
  const { error: showError, success: showSuccess } = useToastStore();
  const { currentTeam, availableTeams, teamConfigs, loadAvailableTeams, loadAllTeams } = useTeamStore();
  const { loadDepartments, collapsedDepartments, toggleDepartmentCollapsed, getGroupedTeams } = useDepartmentStore();

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

  // Track collapsed state for each team (persisted)
  const { collapsedTeams, toggleCollapsed } = useCollapsedTeamsStore();
  const collapsedTeamsSet = useMemo(() => new Set(collapsedTeams), [collapsedTeams]);

  // Get teams grouped by department
  const departmentGroups = getGroupedTeams(availableTeams);

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

  // Load all teams and departments on mount
  useEffect(() => {
    const initTeams = async () => {
      await loadAvailableTeams();
      await loadAllTeams();
      await loadDepartments();
    };
    initTeams();
  }, [loadAvailableTeams, loadAllTeams, loadDepartments]);

  // Get agents for a specific team
  const getAgentsForTeam = useCallback((teamConfig: TeamConfig) => {
    const teamName = teamConfig.team.name;

    // Filter teamAgents by team field (exclude ralph - it's a free agent)
    return teamAgents.filter(a => a.team === teamName && a.name !== 'ralph');
  }, [teamAgents]);


  // Extract ralph names from free agents for display (memoized)
  // Ralph sessions are agent-ralph-{name} (e.g., agent-ralph-ziggy)
  const freeAgentsWithNames = useMemo(() => {
    return freeAgents.map(agent => {
      const ralphName = parseRalphSession(agent.session);
      return { ...agent, ralphName };
    }).sort((a, b) => {
      // Sort by creation timestamp to maintain order (oldest first)
      if (a.created_at && b.created_at) {
        return a.created_at - b.created_at;
      }
      return 0;
    });
  }, [freeAgents]);


  // Handler functions (wrapped with useCallback to prevent re-creation on every render)
  const handleLaunchTeamClick = useCallback(async (teamName: string) => {
    // Store the target team for the launch operation
    setTargetTeam(teamName);

    // Show modal immediately, fetch projects in background
    setShowProjectSelectModal(true);
    setProjectsLoading(true);

    try {
      // Add timeout to prevent UI hang if backend is unresponsive
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Backend timeout')), 10000);
      });
      const projectList = await Promise.race([
        invoke<ProjectInfo[]>('list_projects'),
        timeoutPromise
      ]);
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const handleProjectLaunch = useCallback(async (params: LaunchParams) => {
    try {
      const { projectName, isNew, initialPrompt, updatedOriginalPrompt, followupPrompt } = params;

      // If it's a new project, create it first with the target team
      if (isNew) {
        await invoke('create_project', { projectName, teamName: targetTeam });
      }

      // Launch team with project context (team-scoped)
      // For new projects: pass initialPrompt (written to prompt.md and sent to first phase owner)
      // For existing projects: pass updatedOriginalPrompt (only written if modified) and followupPrompt (sent to note-taker)
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
  }, [targetTeam, launchTeam, showError]);

  const handleKillTeamClick = useCallback((teamName: string) => {
    setTargetTeam(teamName);
    setShowKillDialog(true);
  }, []);

  const handleConfirmKill = useCallback(async () => {
    try {
      await killTeam(targetTeam);
    } catch (error) {
      console.error('Failed to kill team:', error);
      showError(`Failed to kill team: ${error}`);
    }
  }, [targetTeam, killTeam, showError]);

  const handleShowTerminals = useCallback(async (teamName: string) => {
    try {
      await invoke('open_team_terminals', { teamName });
    } catch (error) {
      console.error('Failed to open team terminals:', error);
      showError(`Failed to open terminals: ${error}`);
    }
  }, [showError]);

  // Handler for spawning any agent type (team-scoped)
  const handleSpawnAgent = async (teamName: string, agentName: AgentName, model?: ClaudeModel, chrome?: boolean) => {
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

      await spawnAgent(teamName, agentName, false, model, chrome);

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
  const handleModelSelect = (options: SpawnOptions) => {
    handleSpawnAgent('', 'ralph', options.model, options.chrome);
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
      const failures: string[] = [];
      for (const session of ralphSessions) {
        try {
          await invoke('open_agent_terminal', { session });
        } catch (terminalError) {
          console.error(`Failed to open terminal for ${session}:`, terminalError);
          failures.push(`${session}: ${terminalError}`);
        }
      }
      if (failures.length > 0) {
        showError(`Failed to open some terminals:\n${failures.join('\n')}`);
      } else {
        showSuccess(`Opened ${ralphSessions.length} terminal${ralphSessions.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error(`Failed to open ${ralphDisplayName} terminals:`, error);
      showError(`Failed to open ${ralphDisplayName} terminals: ${error}`);
    }
  };

  return (
    <div className="h-full">
      <div className="w-full h-full flex flex-col">
        {/* Teams List (scrollable area) */}
        <div className="flex-1 min-h-0 overflow-auto">
          {/* Team List - Grouped by Department (hide header when only "Other" group exists) */}
          <div className="space-y-4">
            {departmentGroups.map((group) => {
              const isDeptCollapsed = collapsedDepartments.includes(group.name);
              // Hide department header when there's only one "Other" group (no departments configured)
              const showDepartmentHeader = !(departmentGroups.length === 1 && group.isOther);

              return (
                <div key={group.name}>
                  {/* Department Header - hidden when only "Other" group */}
                  {showDepartmentHeader && (
                    <button
                      onClick={() => toggleDepartmentCollapsed(group.name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/30 rounded-lg transition-colors mb-2"
                    >
                      {isDeptCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        {group.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 ml-auto">
                        {group.teams.length}
                      </Badge>
                    </button>
                  )}

                  {/* Team Cards (collapsible only when department header is shown) */}
                  {(!showDepartmentHeader || !isDeptCollapsed) && (
                    <div className={showDepartmentHeader ? "space-y-3 pl-2" : "space-y-3"}>
                      {group.teams.map(teamName => {
                        const teamConfig = teamConfigs.get(teamName);
                        if (!teamConfig) return null;

                        const teamAgentsList = getAgentsForTeam(teamConfig);

                        return (
                          <div key={teamName}>
                            <TeamCard
                              teamName={teamConfig.team.name || teamName}
                              teamConfig={teamConfig}
                              agents={teamAgentsList}
                              collapsed={collapsedTeamsSet.has(teamName)}
                              onToggleCollapse={() => toggleCollapsed(teamName)}
                              showActions={true}
                              loading={loading}
                              onLaunch={() => handleLaunchTeamClick(teamName)}
                              onKill={() => handleKillTeamClick(teamName)}
                              onShowTerminals={() => handleShowTerminals(teamName)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ralph - Free Agent (fixed at bottom) */}
        <div className="flex-shrink-0 pt-4 border-t border-border/30">
          {/* Header with controls */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/30 border border-border/40">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Free Agents</span>
              {freeAgents.filter(a => a.active).length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                  {freeAgents.filter(a => a.active).length}
                </Badge>
              )}
            </div>

            {/* Control buttons inline */}
            <div className="flex gap-1.5">
              <Tooltip content="Kill All" side="bottom">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleKillAllRalph}
                  disabled={loading || freeAgents.filter(a => a.active).length === 0}
                  className="w-8 h-8 rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
              {!isBrowserMode() && (
                <Tooltip content="Terminals" side="bottom">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenAllRalphTerminals}
                    disabled={loading || freeAgents.filter(a => a.active).length === 0}
                    className="w-8 h-8 rounded-lg"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Free Agent Cards */}
          <div className="flex flex-wrap gap-2 lg:gap-3">
            {freeAgentsWithNames
              .filter(agent => agent.active)
              .map((agent) => (
                <div key={agent.session} className="w-[clamp(120px,calc(70vw/2),160px)]">
                  <AgentCard
                    agent={agent}
                    variant="dashboard"
                    showActions={true}
                    ralphName={agent.ralphName}
                  />
                </div>
              ))}

            {/* Spawn Ralph Button */}
            <div className="w-[clamp(120px,calc(70vw/2),160px)]">
              <Button
                variant="outline"
                onClick={handleSpawnRalphClick}
                disabled={loading}
                className="w-full h-full py-4 rounded-xl border-dashed hover:border-purple-400/40"
                aria-label={`Spawn new ${ralphDisplayName} instance`}
              >
                <Plus className="w-6 h-6 text-foreground/50" />
              </Button>
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
