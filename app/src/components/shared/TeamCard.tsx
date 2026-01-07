import React from 'react';
import { ArrowDown, ArrowRight, Play, XCircle, LayoutGrid } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { AgentCard } from './AgentCard';
import { cn } from '@/lib/utils';
import type { AgentStatus as AgentStatusType } from '@/types';
import type { ProjectInfo } from '@/types/projects';

// Workflow steps for progress tracking (same as ProjectListItem)
const WORKFLOW_STEPS = [
  { key: 'prompt' },
  { key: 'context' },
  { key: 'research' },
  { key: 'plan' },
  { key: 'qa-review' },
  { key: 'progress' },
  { key: 'NOTES' },
];

interface TeamCardProps {
  /** All core agents data */
  agents: AgentStatusType[];
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
  showActions = true,
  loading = false,
  onLaunch,
  onKill,
  onShowTerminals,
}) => {
  // Get Dan (coordinator)
  const dan = agents.find(a => a.name === 'dan');

  // Get workflow agents in order
  const workflowAgents = ['ana', 'bill', 'enzo', 'carl']
    .map(name => agents.find(a => a.name === name))
    .filter((a): a is AgentStatusType => a !== undefined);

  // Determine team project - use Dan's project or first active agent's project
  const getTeamProject = (): string | undefined => {
    // Priority: Dan's project > any active agent's project
    if (dan?.active && dan.current_project) {
      return dan.current_project;
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

  // Calculate step completion for current project
  const currentProjectInfo = teamProject
    ? projects?.find(p => p.name === teamProject)
    : null;

  const stepCompletion = WORKFLOW_STEPS.map(step => ({
    ...step,
    complete: currentProjectInfo?.existing_files.some(f => f.includes(step.key)) ?? false,
  }));

  const completedCount = stepCompletion.filter(s => s.complete).length;

  return (
    <Card className="bg-transparent border-2 border-dashed border-border/60 rounded-2xl p-4 sm:p-6 relative shadow-none w-fit mx-auto">
      {/* Team Control Buttons - Absolute positioned */}
      <div className="absolute top-2 left-4 sm:top-6 sm:left-6 flex gap-1.5">
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
                {completedCount}/{WORKFLOW_STEPS.length}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Dan (Scrum Master) - Centered at top */}
      {dan && (
        <div className="flex justify-center">
          <div className="w-[clamp(140px,70vw,180px)]">
            <AgentCard
              agent={dan}
              variant="dashboard"
              showActions={showActions}
              hideProject
            />
          </div>
        </div>
      )}

      {/* Arrow separator */}
      <div className="flex justify-center py-2 sm:py-3">
        <ArrowDown className={cn(
          "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
          anyActive ? "text-emerald-500/60" : "text-muted-foreground/40"
        )} />
      </div>

      {/* Workflow Agents Row */}
      <div className="flex flex-wrap justify-center gap-2 lg:gap-4">
        {workflowAgents.map((agent, index) => (
          <React.Fragment key={agent.name}>
            <div className="w-[clamp(120px,calc(70vw/2),160px)]">
              <AgentCard
                agent={agent}
                variant="dashboard"
                showActions={showActions}
                hideProject
              />
            </div>
            {index < workflowAgents.length - 1 && (
              <div className="hidden lg:flex items-center justify-center flex-shrink-0">
                <ArrowRight className={cn(
                  "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
                  anyActive ? "text-emerald-500/60" : "text-muted-foreground/40"
                )} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
};
