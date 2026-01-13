import React, { useEffect, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Plus, Users, Clock, CheckCircle2, XCircle, AlertCircle, NotebookPen, Shield, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamConfig, AgentConfig, AgentDirectoryInfo, CronRunLog, CronRunStatus } from '@/types';

interface TeamHistoryTabProps {
  teamConfig: TeamConfig | null;
  onEditAgent: (agent: AgentConfig, index: number) => void;
  onAddAgent: () => void;
  onEditNoteTaker: () => void;
  onEditExceptionHandler: () => void;
  onRemoveAgentFromTeam: (agentName: string) => void;
}

// Status badge component for run history
const RunStatusBadge: React.FC<{ status: CronRunStatus }> = ({ status }) => {
  const statusConfig: Record<CronRunStatus, { color: string; icon: React.ReactNode }> = {
    success: { color: 'bg-green-500/20 text-green-600', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: 'bg-red-500/20 text-red-600', icon: <XCircle className="w-3 h-3" /> },
    running: { color: 'bg-blue-500/20 text-blue-600', icon: <Clock className="w-3 h-3 animate-spin" /> },
    timeout: { color: 'bg-orange-500/20 text-orange-600', icon: <AlertCircle className="w-3 h-3" /> },
    cancelled: { color: 'bg-gray-500/20 text-gray-600', icon: <XCircle className="w-3 h-3" /> },
    skipped: { color: 'bg-yellow-500/20 text-yellow-600', icon: <AlertCircle className="w-3 h-3" /> },
    retrying: { color: 'bg-purple-500/20 text-purple-600', icon: <Clock className="w-3 h-3" /> },
    interrupted: { color: 'bg-orange-500/20 text-orange-600', icon: <AlertCircle className="w-3 h-3" /> },
  };

  const config = statusConfig[status] || statusConfig.cancelled;

  return (
    <Badge variant="secondary" className={cn('gap-1 text-[10px]', config.color)}>
      {config.icon}
      {status}
    </Badge>
  );
};

// Phase agent card with context menu support
interface PhaseAgentCardProps {
  agent: AgentConfig;
  agentInfo: AgentDirectoryInfo | undefined;
  phaseIndex: number;
  phaseName: string;
  onClick: () => void;
  onRemove: (agentName: string) => void;
}

const PhaseAgentCard: React.FC<PhaseAgentCardProps> = ({
  agent,
  agentInfo,
  phaseIndex,
  phaseName,
  onClick,
  onRemove,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`phase-agent-card-menu-${agent.name}-${phaseIndex}`);

  const isComplete = agentInfo?.exists && agentInfo.has_claude_md && agentInfo.has_agent_json;

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Broadcast event to close all other menus
    window.dispatchEvent(new CustomEvent('phase-agent-card-menu-open', { detail: menuId.current }));

    const menuHeight = 50;
    const viewportHeight = window.innerHeight;
    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenu({
      x: e.clientX,
      y: Math.max(8, y),
    });
  };

  // Handle click outside to close context menu
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  // Handle other menu opening (close this one)
  const handleOtherMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  // Close context menu when clicking outside or when another card opens its menu
  useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('phase-agent-card-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('phase-agent-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  // Handle remove from context menu
  const handleRemoveFromMenu = () => {
    setContextMenu(null);
    onRemove(agent.name);
  };

  return (
    <>
      <Card
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'glass-card transition-all duration-200 rounded-xl cursor-pointer min-w-[140px] max-w-[180px]',
          'hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:translate-y-0'
        )}
      >
        <CardHeader className="p-3 pb-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {phaseIndex + 1}
            </Badge>
            <CardTitle className="text-sm font-medium capitalize truncate">
              {agent.name}
            </CardTitle>
          </div>
          <CardDescription className="text-[10px] text-muted-foreground truncate">
            {phaseName}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground truncate">
              {agentInfo?.role || 'No role'}
            </span>
            {isComplete && agentInfo?.model && (
              <span className="text-muted-foreground/70 truncate ml-2">
                {agentInfo.model}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Context menu dropdown */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={handleRemoveFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Remove from Team
          </button>
        </div>,
        document.body
      )}
    </>
  );
};

export const TeamHistoryTab: React.FC<TeamHistoryTabProps> = ({
  teamConfig,
  onEditAgent,
  onAddAgent,
  onEditNoteTaker,
  onEditExceptionHandler,
  onRemoveAgentFromTeam,
}) => {
  const [agentInfos, setAgentInfos] = useState<AgentDirectoryInfo[]>([]);
  const [runHistory, setRunHistory] = useState<CronRunLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch agent directory info for role/model display
  const fetchAgentInfos = useCallback(async () => {
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      setAgentInfos(dirs);
    } catch (err) {
      console.error('Failed to load agent info:', err);
    }
  }, []);

  // Fetch run history
  const fetchRunHistory = useCallback(async () => {
    try {
      const runs = await invoke<CronRunLog[]>('get_cron_run_history', { limit: 50 });
      setRunHistory(runs);
    } catch (err) {
      console.error('Failed to load run history:', err);
    }
  }, []);

  // Create a stable key from agent names to detect when agents change
  const agentNamesKey = teamConfig?.team?.agents?.map(a => a.name).join(',') || '';
  const phasesKey = teamConfig?.team?.workflow?.phases?.map(p => `${p.name}:${p.owner}`).join(',') || '';

  // Load data on mount and when team/agents change
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAgentInfos(), fetchRunHistory()]).finally(() => {
      setLoading(false);
    });
  }, [fetchAgentInfos, fetchRunHistory, teamConfig?.team?.name, agentNamesKey, phasesKey]);

  // Get agent info by name
  const getAgentInfo = (name: string) => agentInfos.find(a => a.name === name);

  // Get workflow phases with their owner agents (in order)
  const workflowPhases = teamConfig?.team?.workflow?.phases || [];

  // Filter runs for team agents
  const teamAgentNames = teamConfig?.team?.agents?.map(a => a.name) || [];
  const teamRuns = runHistory.filter(run => teamAgentNames.includes(run.agent_name));

  // Format duration
  const formatDuration = (secs?: number) => {
    if (!secs) return '-';
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Find agent config by name
  const findAgentConfig = (name: string): { agent: AgentConfig; index: number } | null => {
    const agents = teamConfig?.team?.agents || [];
    const index = agents.findIndex(a => a.name === name);
    if (index === -1) return null;
    return { agent: agents[index], index };
  };

  if (!teamConfig) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">Select a team to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Team Summary + Workflow Pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Team Header */}
          <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground capitalize">
                  {teamConfig.team.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {teamConfig.team.description || `${teamConfig.team.agents.length} agents configured`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {teamConfig.team.agents.length} agents
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {workflowPhases.length} phases
                </Badge>
              </div>
            </div>
          </div>

          {/* Workflow Pipeline - Agents in row representing phases */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Workflow Pipeline
              </h3>
              <Button variant="ghost" size="sm" onClick={onAddAgent} className="h-7 px-2 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add Agent
              </Button>
            </div>

            {/* Agents row with arrows */}
            <div className="flex flex-wrap items-center gap-2 lg:gap-3">
              {workflowPhases.map((phase, index) => {
                const agentConfig = findAgentConfig(phase.owner);
                if (!agentConfig) return null;

                return (
                  <React.Fragment key={`${phase.name}-${phase.owner}-${index}`}>
                    <PhaseAgentCard
                      agent={agentConfig.agent}
                      agentInfo={getAgentInfo(phase.owner)}
                      phaseIndex={index}
                      phaseName={phase.name}
                      onClick={() => onEditAgent(agentConfig.agent, agentConfig.index)}
                      onRemove={onRemoveAgentFromTeam}
                    />
                    {index < workflowPhases.length - 1 && (
                      <div className="hidden sm:flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Add phase placeholder */}
              <div
                onClick={onAddAgent}
                className="p-3 rounded-xl border border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-secondary/20 transition-all flex items-center justify-center min-w-[100px] min-h-[80px]"
              >
                <div className="text-center text-muted-foreground hover:text-primary transition-colors">
                  <Plus className="w-4 h-4 mx-auto mb-1" />
                  <span className="text-[10px]">Add</span>
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Roles */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Workflow Roles
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Workflow progression is automated via hooks. These roles handle documentation and exceptions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Note-taker */}
              <div
                onClick={onEditNoteTaker}
                className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/15 transition-all group"
              >
                <div className="flex items-center gap-2">
                  <NotebookPen className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-purple-400 uppercase tracking-wider">Note-taker</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium text-foreground capitalize group-hover:text-purple-400 transition-colors">
                    {teamConfig.team.workflow.note_taker || 'Not assigned'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Documents workflow progress</p>
              </div>

              {/* Exception Handler (Guardian) */}
              <div
                onClick={onEditExceptionHandler}
                className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/15 transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-400 uppercase tracking-wider">Guardian</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium text-foreground capitalize group-hover:text-amber-400 transition-colors">
                    {teamConfig.team.workflow.exception_handler || 'Not assigned'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Handles workflow exceptions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Run History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Run History
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {teamRuns.length} runs
            </Badge>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-auto">
            {loading ? (
              <div className="text-center py-8">
                <Clock className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading history...</p>
              </div>
            ) : teamRuns.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No runs yet</p>
              </div>
            ) : (
              teamRuns.slice(0, 20).map((run) => (
                <div
                  key={run.run_id}
                  className="p-3 rounded-lg bg-card/50 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm capitalize truncate">{run.agent_name}</span>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatTimeAgo(run.started_at)}</span>
                    <span>{formatDuration(run.duration_secs)}</span>
                    {run.total_cost_usd && (
                      <span>${run.total_cost_usd.toFixed(4)}</span>
                    )}
                  </div>
                  {run.error && (
                    <p className="text-xs text-destructive mt-1 truncate">{run.error}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
