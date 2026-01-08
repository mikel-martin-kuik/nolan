import React from 'react';
import { ArrowDown, ArrowRight, Play, XCircle, LayoutGrid, ChevronRight, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { AgentCard } from './AgentCard';
import { cn } from '@/lib/utils';
import type { AgentStatus as AgentStatusType, TeamConfig } from '@/types';
import { getWorkflowSteps } from '@/types';
import type { ProjectInfo } from '@/types/projects';

interface TeamCardProps {
  /** All core agents data */
  agents: AgentStatusType[];
  /** Team name to display */
  teamName: string;
  /** Team configuration (optional, will use store if not provided) */
  teamConfig?: TeamConfig;
  /** Whether the card is collapsed */
  collapsed?: boolean;
  /** Handler for toggling collapse state */
  onToggleCollapse?: () => void;
  /** Show action buttons on individual agent cards */
  showActions?: boolean;
  /** Loading state for controls */
  loading?: boolean;
  /** Handler for launch button */
  onLaunch?: () => void;
  /** Handler for kill button */
  onKill?: () => void;
  /** Handler for terminals button */
  onShowTerminals?: () => void;
}

export const TeamCard: React.FC<TeamCardProps> = ({
  agents,
  teamName,
  teamConfig,
  collapsed = false,
  onToggleCollapse,
  showActions = true,
  loading = false,
  onLaunch,
  onKill,
  onShowTerminals,
}) => {
  // Use provided team config or fall back to the team's config
  const config = teamConfig;

  // Get coordinator from team config
  const coordinatorName = config?.team.workflow.coordinator ?? 'dan';
  const coordinator = agents.find(a => a.name === coordinatorName);

  // Get workflow agents from team config (in phase order)
  const workflowAgentNames = config?.team.workflow.phases
    .map(p => p.owner)
    .filter((name, index, arr) => arr.indexOf(name) === index) // unique
    .filter(name => name !== coordinatorName) // exclude coordinator
    ?? [];
  const workflowAgents = workflowAgentNames
    .map(name => agents.find(a => a.name === name))
    .filter((a): a is AgentStatusType => a !== undefined);

  // Determine team project - use coordinator's project or first active agent's project
  const getTeamProject = (): string | undefined => {
    // Priority: coordinator's project > any active agent's project
    if (coordinator?.active && coordinator.current_project) {
      return coordinator.current_project;
    }
    const activeAgent = agents.find(a => a.active && a.current_project);
    return activeAgent?.current_project;
  };

  const teamProject = getTeamProject();
  const anyActive = agents.some(a => a.active);
  const allActive = agents.length > 0 && agents.every(a => a.active);

  // Fetch projects to get workflow progress for the current team project
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => invoke<ProjectInfo[]>('list_projects'),
    enabled: !!teamProject,
    refetchInterval: teamProject ? 10000 : false, // Refresh every 10s when active
  });

  // Calculate step completion for current project using dynamic workflow steps
  const currentProjectInfo = teamProject
    ? projects?.find(p => p.name === teamProject)
    : null;

  const workflowSteps = getWorkflowSteps(config ?? null);
  const stepCompletion = workflowSteps.map(step => ({
    ...step,
    complete: currentProjectInfo?.existing_files.some(f => f.includes(step.key)) ?? false,
  }));

  const completedCount = stepCompletion.filter(s => s.complete).length;

  // Arrow state types for workflow progression visualization
  type ArrowState = 'completed' | 'current' | 'pending';

  // Derive arrow states from step completion
  // Each arrow appears AFTER its agent, so arrow[i] represents the transition from agent[i] to agent[i+1]
  const getArrowStates = (): ArrowState[] => {
    if (!teamProject || !currentProjectInfo) {
      // No project - all arrows are pending (dimmed)
      return workflowAgents.slice(0, -1).map(() => 'pending');
    }

    // Map each workflow agent to their output file completion status
    const agentCompletion = workflowAgents.map(agent => {
      const agentStep = stepCompletion.find(s => s.owner === agent.name);
      return agentStep?.complete ?? false;
    });

    // Arrow[i] = transition from agent[i] to agent[i+1]
    // - 'completed': agent[i] has completed their output file
    // - 'current': agent[i] is working (first incomplete in sequence)
    // - 'pending': not yet reached in workflow
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
  };

  const arrowStates = getArrowStates();

  // Vertical arrow state: completed if context.md exists and first agent output exists
  const verticalArrowState: ArrowState = (() => {
    if (!teamProject || !currentProjectInfo) return 'pending';
    const contextComplete = stepCompletion.find(s => s.key === 'context')?.complete ?? false;
    if (!contextComplete) return 'pending';
    // Context exists, so coordinator has handed off - this arrow is "completed" or "current"
    const firstAgentComplete = arrowStates.length > 0 ? arrowStates[0] === 'completed' : false;
    return contextComplete ? (firstAgentComplete ? 'completed' : 'current') : 'pending';
  })();

  // Helper function to get arrow classes based on state
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

  // Layout type determination for different team sizes
  type LayoutType = 'single-row' | 'two-row';

  const getLayoutType = (agentCount: number): LayoutType => {
    // For current teams (3-5 agents), single row works well
    // Future: 6+ agents could use two-row layout
    if (agentCount >= 6) {
      return 'two-row';
    }
    return 'single-row';
  };

  const layoutType = getLayoutType(workflowAgents.length);

  // Find the currently active workflow agent (first agent whose output is incomplete and is active)
  const getCurrentWorkflowAgent = (): string | null => {
    if (!teamProject || !currentProjectInfo) return null;

    for (const agent of workflowAgents) {
      const step = stepCompletion.find(s => s.owner === agent.name);
      if (step && !step.complete && agent.active) {
        return agent.name;
      }
    }
    return null;
  };

  const currentWorkflowAgent = getCurrentWorkflowAgent();

  const agentCount = agents.length;

  return (
    <Card className={cn(
      "bg-transparent border-2 border-dashed border-border/60 rounded-2xl relative shadow-none",
      collapsed ? "p-0" : "p-4 sm:p-6",
      !collapsed && "w-fit mx-auto"
    )}>
      {/* Collapsible Header */}
      <button
        onClick={onToggleCollapse}
        className={cn(
          "w-full flex items-center justify-between gap-3 text-left",
          "hover:bg-accent/30 transition-colors rounded-xl",
          collapsed ? "p-3 sm:p-4" : "absolute top-0 left-0 right-0 p-2 sm:p-3 -translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-medium text-sm">{teamName}</span>
          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
            {agentCount} agent{agentCount !== 1 ? 's' : ''}
          </span>
          {anyActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Active" />
          )}
        </div>
        {teamProject && (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {teamProject}
          </span>
        )}
      </button>

      {/* Expanded Content */}
      {!collapsed && (
        <>
          {/* Collapse toggle in top-left corner when expanded */}
          <button
            onClick={onToggleCollapse}
            className="absolute top-2 left-2 sm:top-3 sm:left-3 p-1 hover:bg-accent/50 rounded-lg transition-colors z-10"
            title="Collapse team"
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Team Control Buttons - Absolute positioned */}
          <div className="absolute top-2 left-10 sm:top-6 sm:left-12 flex gap-1.5">
            <Tooltip content="Launch" side="bottom">
              <button
                onClick={onLaunch}
                disabled={loading || allActive || !onLaunch}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center",
                  "active:scale-95 transition-all duration-200",
                  "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-muted-foreground",
                  !anyActive
                    ? "bg-emerald-500/15 border border-emerald-400/30 text-emerald-500 hover:bg-emerald-500/25 hover:border-emerald-400/50"
                    : "bg-secondary/50 border border-border text-muted-foreground hover:bg-emerald-500/10 hover:border-emerald-400/20 hover:text-emerald-500"
                )}
              >
                <Play className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Kill" side="bottom">
              <button
                onClick={onKill}
                disabled={loading || !anyActive || !onKill}
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
                onClick={onShowTerminals}
                disabled={loading || !anyActive || !onShowTerminals}
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

          {/* Team Project Label - Absolute positioned */}
          {anyActive && (
            <div className="absolute top-2 right-4 sm:top-6 sm:right-6 flex flex-col items-end gap-0.5">
              {/* Project Name - simple subtitle style */}
              <span className="text-xs text-muted-foreground">
                {teamProject || 'VIBING'}
              </span>
              {/* Progress Dots - below project name */}
              {teamProject && currentProjectInfo && (
                <div className="flex items-center gap-0.5">
                  {stepCompletion.map((step) => (
                    <div
                      key={step.key}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-colors",
                        step.complete ? "bg-primary" : "bg-muted-foreground/20"
                      )}
                      title={`${step.key}.md`}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {completedCount}/{workflowSteps.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Team name when expanded - centered above coordinator */}
          <div className="text-center mb-2 mt-6">
            <span className="text-sm font-medium text-muted-foreground">{teamName}</span>
          </div>

          {/* Coordinator (Scrum Master) - Centered at top */}
          {coordinator && (
            <div className="flex justify-center">
              <div className="w-[clamp(140px,70vw,180px)]">
                <AgentCard
                  agent={coordinator}
                  variant="dashboard"
                  showActions={showActions}
                  hideProject
                />
              </div>
            </div>
          )}

          {/* Arrow separator - state-based styling */}
          <div className="flex justify-center py-2 sm:py-3">
            <ArrowDown className={cn(
              "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
              getArrowClasses(verticalArrowState)
            )} />
          </div>

          {/* Workflow Agents Row - Layout adapts to team size */}
          {layoutType === 'single-row' && (
            <div className="flex flex-wrap justify-center items-center gap-2 lg:gap-3">
              {workflowAgents.map((agent, index) => (
                <React.Fragment key={agent.name}>
                  <div className="w-[clamp(120px,calc(70vw/2),160px)]">
                    <AgentCard
                      agent={agent}
                      variant="dashboard"
                      showActions={showActions}
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

          {/* Two-row layout for 6+ workflow agents */}
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
                      <div className="w-[clamp(120px,calc(70vw/2),160px)]">
                        <AgentCard
                          agent={agent}
                          variant="dashboard"
                          showActions={showActions}
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
                        <div className="w-[clamp(120px,calc(70vw/2),160px)]">
                          <AgentCard
                            agent={agent}
                            variant="dashboard"
                            showActions={showActions}
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
        </>
      )}
    </Card>
  );
};
