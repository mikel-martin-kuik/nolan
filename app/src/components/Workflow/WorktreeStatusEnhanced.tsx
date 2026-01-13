import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@/lib/api';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  GitBranch,
  FolderGit,
  Play,
  RefreshCw,
  Link2,
} from 'lucide-react';
import type { WorktreeListEntry } from '../../types';

interface WorktreeStatusEnhancedProps {
  refreshInterval?: number;
}

export function WorktreeStatusEnhanced({
  refreshInterval = 30000
}: WorktreeStatusEnhancedProps) {
  const [worktrees, setWorktrees] = useState<WorktreeListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pipelines = useWorkflowVisualizerStore((state) => state.pipelines);
  const setSelectedPipelineId = useWorkflowVisualizerStore((state) => state.setSelectedPipelineId);
  const setViewMode = useWorkflowVisualizerStore((state) => state.setViewMode);
  const { success: showSuccess, error: showError } = useToastStore();

  const fetchWorktrees = useCallback(async () => {
    try {
      const data = await invoke<WorktreeListEntry[]>('list_worktrees');
      setWorktrees(data);
    } catch (error) {
      console.error('Failed to fetch worktrees:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorktrees();
    const interval = setInterval(fetchWorktrees, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchWorktrees, refreshInterval]);

  const handleTriggerAgent = async (agentName: string) => {
    try {
      await invoke('trigger_cron_agent', { name: agentName });
      showSuccess(`Triggered ${agentName}`);
    } catch (error) {
      showError(`Failed to trigger ${agentName}: ${error}`);
    }
  };

  const findLinkedPipeline = (branch: string) => {
    return pipelines.find((p) => p.worktreeBranch === branch);
  };

  const handlePipelineLink = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    setViewMode('pipelines');
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Worktrees</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (worktrees.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <FolderGit className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No active worktrees</p>
          <p className="text-sm">Worktrees appear when agents create branches</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="sticky top-0 bg-background z-10">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FolderGit className="h-5 w-5" />
            Worktrees
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchWorktrees}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {worktrees.map((worktree) => {
          const linkedPipeline = findLinkedPipeline(worktree.branch);
          // Extract agent from branch pattern: worktree/{agent}/{run_id}
          const branchMatch = worktree.branch.match(/worktree\/(\w+)\/.+/);
          const agentName = branchMatch?.[1];

          return (
            <div
              key={worktree.path}
              className="p-3 border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-mono text-sm truncate">{worktree.branch}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {worktree.path}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {linkedPipeline && (
                    <Tooltip content="View linked pipeline" side="top">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePipelineLink(linkedPipeline.id)}
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                    </Tooltip>
                  )}

                  {agentName && (
                    <Tooltip content={`Trigger ${agentName}`} side="top">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => handleTriggerAgent(agentName)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Trigger
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>

              {linkedPipeline && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {linkedPipeline.currentStage}
                  </Badge>
                  <Badge
                    variant={
                      linkedPipeline.overallStatus === 'completed' ? 'default' :
                      linkedPipeline.overallStatus === 'failed' ? 'destructive' :
                      'secondary'
                    }
                    className="text-xs"
                  >
                    {linkedPipeline.overallStatus}
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
