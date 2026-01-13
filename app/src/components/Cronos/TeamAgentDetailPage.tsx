import React, { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke, isBrowserMode } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { useAgentStore } from '@/store/agentStore';
import { Play, XCircle, LayoutGrid, ArrowRight, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import { AgentCard } from '@/components/shared/AgentCard';
import { getWorkflowSteps } from '@/types';
import type { CronAgentInfo, TeamConfig, AgentStatus as AgentStatusType } from '@/types';
import type { ProjectInfo } from '@/types/projects';

interface TeamAgentDetailPageProps {
  agentName: string;
  onBack: () => void;
}

export const TeamAgentDetailPage: React.FC<TeamAgentDetailPageProps> = ({
  agentName,
  onBack,
}) => {
  const { error: showError, success: showSuccess } = useToastStore();
  const { teamAgents, updateStatus, launchTeam, killTeam } = useAgentStore();
  const [activeTab, setActiveTab] = useState<'workflow' | 'history'>('workflow');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Extract team name from cron agent name (e.g., "team-nolan" -> "nolan")
  const teamName = useMemo(() => {
    return agentName.replace(/^team-/, '');
  }, [agentName]);

  // Fetch team config
  const { data: teamConfig, isLoading: teamConfigLoading, error: teamConfigError } = useQuery({
    queryKey: ['team-config', teamName],
    queryFn: async () => {
      try {
        return await invoke<TeamConfig>('get_team_config', { team_name: teamName });
      } catch (err) {
        console.error(`Failed to load team config '${teamName}':`, err);
        throw err;
      }
    },
    enabled: !!teamName,
    retry: 1,
  });

  // Fetch cron agent info (unused but kept for potential future use)
  useQuery({
    queryKey: ['cron-agent', agentName],
    queryFn: async () => {
      const agents = await invoke<CronAgentInfo[]>('list_cron_agents');
      return agents.find(a => a.name === agentName) || null;
    },
    refetchInterval: 5000,
  });

  // Fetch projects for this team
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => invoke<ProjectInfo[]>('list_projects'),
    refetchInterval: 10000,
  });

  // Filter projects for this team
  const teamProjects = useMemo(() => {
    return projects.filter(p => p.team === teamName).sort((a, b) =>
      new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime()
    );
  }, [projects, teamName]);

  // Get workflow agents from team config (in phase order)
  const workflowAgentNames = useMemo(() => {
    if (!teamConfig) return [];
    return teamConfig.team.workflow.phases
      .map(p => p.owner)
      .filter((name, index, arr) => arr.indexOf(name) === index);
  }, [teamConfig]);

  // Map workflow agents to their status from the agent store
  const workflowAgents = useMemo(() => {
    return workflowAgentNames
      .map(name => teamAgents.find(a => a.name === name))
      .filter((a): a is AgentStatusType => a !== undefined);
  }, [workflowAgentNames, teamAgents]);

  // Determine team status
  const anyActive = workflowAgents.some(a => a.active);
  const allActive = workflowAgents.length > 0 && workflowAgents.every(a => a.active);

  // Get current project (first active agent's project)
  const currentProject = useMemo(() => {
    const activeAgent = workflowAgents.find(a => a.active && a.current_project);
    return activeAgent?.current_project;
  }, [workflowAgents]);

  // Current project info
  const currentProjectInfo = useMemo(() => {
    if (!currentProject) return null;
    return teamProjects.find(p => p.name === currentProject) || null;
  }, [currentProject, teamProjects]);

  // Workflow steps and completion
  const workflowSteps = useMemo(() => getWorkflowSteps(teamConfig ?? null), [teamConfig]);

  const stepCompletion = useMemo(() => {
    return workflowSteps.map(step => {
      if (step.key === 'close') {
        return { ...step, complete: currentProjectInfo?.status === 'complete' };
      }
      const completion = currentProjectInfo?.file_completions.find(
        f => f.file === `${step.key}.md` || f.file === step.key
      );
      return {
        ...step,
        complete: completion?.completed ?? false,
      };
    });
  }, [workflowSteps, currentProjectInfo]);

  const completedCount = stepCompletion.filter(s => s.complete).length;

  // Arrow states for workflow progression visualization
  type ArrowState = 'completed' | 'current' | 'pending';

  const getArrowStates = useCallback((): ArrowState[] => {
    if (!currentProject || !currentProjectInfo) {
      return workflowAgents.slice(0, -1).map(() => 'pending');
    }

    const agentCompletion = workflowAgents.map(agent => {
      const agentStep = stepCompletion.find(s => s.owner === agent.name);
      return agentStep?.complete ?? false;
    });

    const arrows: ArrowState[] = [];
    let foundCurrent = false;

    for (let i = 0; i < workflowAgents.length - 1; i++) {
      if (agentCompletion[i]) {
        arrows.push('completed');
      } else if (!foundCurrent) {
        arrows.push('current');
        foundCurrent = true;
      } else {
        arrows.push('pending');
      }
    }

    return arrows;
  }, [currentProject, currentProjectInfo, workflowAgents, stepCompletion]);

  const arrowStates = getArrowStates();

  const getArrowClasses = (state: ArrowState): string => {
    switch (state) {
      case 'completed':
        return 'text-emerald-500';
      case 'current':
        return 'text-primary animate-pulse';
      case 'pending':
        return 'text-muted-foreground/30';
    }
  };

  // Find currently active workflow agent
  const currentWorkflowAgent = useMemo(() => {
    if (!currentProject || !currentProjectInfo) return null;

    for (const agent of workflowAgents) {
      const step = stepCompletion.find(s => s.owner === agent.name);
      if (step && !step.complete && agent.active) {
        return agent.name;
      }
    }
    return null;
  }, [currentProject, currentProjectInfo, workflowAgents, stepCompletion]);

  // Layout type determination
  type LayoutType = 'single-row' | 'two-row';
  const layoutType: LayoutType = workflowAgents.length >= 6 ? 'two-row' : 'single-row';

  // Team control handlers
  const handleLaunch = useCallback(async () => {
    setLoading(true);
    try {
      // Generate a simple project name based on timestamp
      const projectName = `project-${Date.now().toString(36)}`;
      await launchTeam(teamName, projectName);
      showSuccess(`Launched team ${teamName} with project ${projectName}`);
      updateStatus();
    } catch (err) {
      showError(`Failed to launch team: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [teamName, launchTeam, showSuccess, showError, updateStatus]);

  const handleKill = useCallback(async () => {
    setLoading(true);
    try {
      await killTeam(teamName);
      showSuccess(`Killed team ${teamName} agents`);
      updateStatus();
    } catch (err) {
      showError(`Failed to kill team: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [teamName, killTeam, showSuccess, showError, updateStatus]);

  const handleShowTerminals = useCallback(async () => {
    try {
      await invoke('open_team_terminals', { team_name: teamName });
    } catch (err) {
      showError(`Failed to open terminals: ${err}`);
    }
  }, [teamName, showError]);

  // Toggle project expansion
  const toggleProject = (projectName: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  // Calculate team health stats
  const teamStats = useMemo(() => {
    const completed = teamProjects.filter(p => p.status === 'complete').length;
    const inProgress = teamProjects.filter(p => p.status === 'inprogress').length;
    const total = teamProjects.length;
    const successRate = total > 0 ? completed / total : 0;

    return { completed, inProgress, total, successRate };
  }, [teamProjects]);

  if (teamConfigLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading team configuration...</p>
      </div>
    );
  }

  if (!teamConfig) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {teamConfigError
            ? `Failed to load team '${teamName}': ${teamConfigError}`
            : `Team configuration not found: ${teamName}`}
        </p>
        <p className="text-xs text-muted-foreground/70">
          Expected at ~/.nolan/teams/{teamName}.yaml
        </p>
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs h-7 px-2 w-fit">Back</Button>

        <div className="sm:ml-auto sm:text-right">
          <h1 className="text-base sm:text-lg font-semibold">{teamConfig.team.name || teamName}</h1>
          <p className="text-xs text-muted-foreground">
            {anyActive ? 'Active' : 'Inactive'} · {workflowAgents.length} agents · {teamStats.total} projects
            <span className="hidden sm:inline">
              {' · '}{(teamStats.successRate * 100).toFixed(0)}% completed
              {currentProject && ` · Working on: ${currentProject}`}
            </span>
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit mb-3 sm:mb-4">
        <button
          onClick={() => setActiveTab('workflow')}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'workflow' && "bg-foreground/10 text-foreground",
            activeTab !== 'workflow' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Workflow</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'history' && "bg-foreground/10 text-foreground",
            activeTab !== 'history' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>History</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Workflow Tab */}
        {activeTab === 'workflow' && (
          <div className="h-full overflow-hidden flex flex-col gap-4">
            {/* Team Controls + Project Info */}
            <Card className="flex-shrink-0">
              <CardContent className="py-3 sm:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {/* Control Buttons + Project Progress Row */}
                  <div className="flex items-center gap-3">
                    {/* Control Buttons */}
                    <div className="flex gap-1.5">
                      <Tooltip content="Launch Team" side="bottom">
                        <button
                          onClick={handleLaunch}
                          disabled={loading || allActive}
                          className={cn(
                            "w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center",
                            "active:scale-95 transition-all duration-200",
                            "disabled:opacity-30 disabled:cursor-not-allowed",
                            !anyActive
                              ? "bg-emerald-500/15 border border-emerald-400/30 text-emerald-500 hover:bg-emerald-500/25"
                              : "bg-secondary/50 border border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                          )}
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Kill Team" side="bottom">
                        <button
                          onClick={handleKill}
                          disabled={loading || !anyActive}
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center
                            bg-secondary/50 border border-border text-muted-foreground
                            hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-500
                            active:scale-95 transition-all duration-200
                            disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      {!isBrowserMode() && (
                        <Tooltip content="Open Terminals" side="bottom">
                          <button
                            onClick={handleShowTerminals}
                            disabled={loading || !anyActive}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center
                              bg-secondary/50 border border-border text-muted-foreground
                              hover:bg-accent hover:text-foreground
                              active:scale-95 transition-all duration-200
                              disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                    </div>

                    {/* Project Progress */}
                    {anyActive && (
                      <div className="flex items-center gap-2 sm:gap-3 sm:ml-4">
                        <span className="text-xs text-muted-foreground truncate max-w-[100px] sm:max-w-none">
                          {currentProject || 'VIBING'}
                        </span>
                        {currentProject && currentProjectInfo && (
                          <div className="hidden sm:flex items-center gap-2">
                            {/* Segmented progress bar */}
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-muted-foreground/10">
                              {stepCompletion.map((step, index) => (
                                <Tooltip key={step.key} content={`${step.key}.md`} side="bottom">
                                  <div
                                    className={cn(
                                      "h-full w-6 transition-colors",
                                      step.complete ? "bg-primary" : "bg-muted-foreground/20",
                                      index > 0 && "border-l border-background/50"
                                    )}
                                  />
                                </Tooltip>
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {completedCount}/{workflowSteps.length}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Team Stats */}
                  <div className="sm:ml-auto grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-4 text-center">
                    <div>
                      <p className="text-base sm:text-lg font-bold">{teamStats.completed}</p>
                      <p className="text-[10px] text-muted-foreground">Completed</p>
                    </div>
                    <div>
                      <p className="text-base sm:text-lg font-bold">{teamStats.inProgress}</p>
                      <p className="text-[10px] text-muted-foreground">In Progress</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={teamStats.successRate * 100} className="h-2 w-12 sm:w-16" />
                      <span className="text-xs sm:text-sm font-medium">{(teamStats.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Workflow Visualization */}
            <Card className="flex-1 min-h-0 overflow-hidden">
              <CardHeader className="py-3 flex-shrink-0">
                <CardTitle className="text-sm">Team Workflow</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {/* Single Row Layout */}
                {layoutType === 'single-row' && (
                  <div className="flex flex-wrap justify-center items-center gap-2 lg:gap-3">
                    {workflowAgents.map((agent, index) => (
                      <React.Fragment key={agent.name}>
                        <div className="w-[clamp(120px,calc(70vw/3),160px)]">
                          <AgentCard
                            agent={agent}
                            variant="dashboard"
                            showActions={true}
                            hideProject
                            isWorkflowActive={agent.name === currentWorkflowAgent}
                          />
                        </div>
                        {index < workflowAgents.length - 1 && (
                          <div className="hidden lg:flex items-center justify-center flex-shrink-0">
                            <ArrowRight className={cn(
                              "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
                              getArrowClasses(arrowStates[index])
                            )} />
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Two Row Layout */}
                {layoutType === 'two-row' && (() => {
                  const midpoint = Math.ceil(workflowAgents.length / 2);
                  const topRow = workflowAgents.slice(0, midpoint);
                  const bottomRow = workflowAgents.slice(midpoint);

                  return (
                    <div className="flex flex-col items-center gap-2">
                      {/* Top row */}
                      <div className="flex flex-wrap justify-center items-center gap-2 lg:gap-3">
                        {topRow.map((agent, index) => (
                          <React.Fragment key={agent.name}>
                            <div className="w-[clamp(120px,calc(70vw/3),160px)]">
                              <AgentCard
                                agent={agent}
                                variant="dashboard"
                                showActions={true}
                                hideProject
                                isWorkflowActive={agent.name === currentWorkflowAgent}
                              />
                            </div>
                            {index < topRow.length - 1 && (
                              <div className="hidden lg:flex items-center">
                                <ArrowRight className={cn("w-4 h-4", getArrowClasses(arrowStates[index]))} />
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Connecting arrow between rows */}
                      <div className="flex justify-end w-full pr-8">
                        <ArrowDown className={cn(
                          "w-4 h-4",
                          getArrowClasses(arrowStates[midpoint - 1])
                        )} />
                      </div>

                      {/* Bottom row */}
                      <div className="flex flex-wrap justify-center items-center gap-2 lg:gap-3">
                        {bottomRow.map((agent, index) => {
                          const globalIndex = midpoint + index;
                          return (
                            <React.Fragment key={agent.name}>
                              <div className="w-[clamp(120px,calc(70vw/3),160px)]">
                                <AgentCard
                                  agent={agent}
                                  variant="dashboard"
                                  showActions={true}
                                  hideProject
                                  isWorkflowActive={agent.name === currentWorkflowAgent}
                                />
                              </div>
                              {index < bottomRow.length - 1 && (
                                <div className="hidden lg:flex items-center">
                                  <ArrowRight className={cn("w-4 h-4", getArrowClasses(arrowStates[globalIndex]))} />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {workflowAgents.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No workflow agents configured</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <Card className="flex-1 min-h-0 overflow-hidden">
            <CardHeader className="py-3 flex-shrink-0">
              <CardTitle className="text-sm">Project History</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full px-4 pb-4">
                {teamProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No projects yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamProjects.map((project) => {
                      const isExpanded = expandedProjects.has(project.name);
                      const projectSteps = workflowSteps.map(step => {
                        if (step.key === 'close') {
                          return { ...step, complete: project.status === 'complete' };
                        }
                        const completion = project.file_completions.find(
                          f => f.file === `${step.key}.md` || f.file === step.key
                        );
                        return { ...step, complete: completion?.completed ?? false };
                      });
                      const projectCompletedCount = projectSteps.filter(s => s.complete).length;

                      return (
                        <Card
                          key={project.name}
                          className={cn(
                            "cursor-pointer hover:border-primary/50 transition-colors",
                            project.status === 'complete' && "border-emerald-500/30",
                            project.status === 'inprogress' && "border-blue-500/30"
                          )}
                        >
                          {/* Project Header */}
                          <div
                            className="p-3 flex items-center gap-3"
                            onClick={() => toggleProject(project.name)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{project.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(project.last_modified).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded border",
                                project.status === 'complete' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                                project.status === 'inprogress' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                                project.status === 'pending' && "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              )}>
                                {project.status}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {projectCompletedCount}/{workflowSteps.length}
                              </span>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="px-3 pb-3 border-t border-border/50">
                              <div className="mt-3 space-y-2">
                                <p className="text-xs text-muted-foreground">Workflow Progress:</p>
                                <div className="flex flex-wrap gap-2">
                                  {projectSteps.map((step) => (
                                    <div
                                      key={step.key}
                                      className={cn(
                                        "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                                        step.complete ? "bg-emerald-500/10 text-emerald-400" : "bg-muted-foreground/10 text-muted-foreground"
                                      )}
                                    >
                                      <span className={cn(
                                        "w-2 h-2 rounded-full",
                                        step.complete ? "bg-emerald-500" : "bg-muted-foreground/30"
                                      )} />
                                      <span>{step.label}</span>
                                      <span className="text-[10px] opacity-60">({step.owner})</span>
                                    </div>
                                  ))}
                                </div>
                                {project.status_detail && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {project.status_detail}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
