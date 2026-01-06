import React from 'react';
import { ArrowDown, ArrowRight, Play, XCircle, LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { AgentCard } from './AgentCard';
import type { AgentStatus as AgentStatusType } from '@/types';

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

  return (
    <Card className="bg-transparent border-2 border-dashed border-border/60 rounded-2xl p-4 sm:p-6 relative shadow-none w-fit mx-auto">
      {/* Top row: Controls left, Project label right */}
      <div className="flex items-center justify-between mb-2">
        {/* Team Control Buttons */}
        <div className="flex gap-1.5">
          <Tooltip content="Launch" side="bottom">
            <button
              onClick={onLaunch}
              disabled={loading || allActive || !onLaunch}
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

        {/* Team Project Label */}
        {anyActive && (
          <span
            className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap ${
              teamProject
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {teamProject || 'VIBING'}
          </span>
        )}
      </div>

      {/* Dan (Scrum Master) - Centered at top */}
      {dan && (
        <div className="flex justify-center pt-1 sm:pt-2">
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
        <ArrowDown className="w-4 h-4 sm:w-5 sm:h-5 text-primary/40" />
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
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-primary/40" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
};
