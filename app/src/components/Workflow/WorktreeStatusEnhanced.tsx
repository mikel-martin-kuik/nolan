import { useCallback, useEffect, useState, useRef } from 'react';
import { invoke } from '@/lib/api';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  FolderGit,
  Play,
  RefreshCw,
  Link2,
  Trash2,
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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; worktree: WorktreeListEntry; agentName: string | undefined } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef('worktree-status-card-menu');

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, worktree: WorktreeListEntry, agentName: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('worktree-status-card-menu-open', { detail: menuId.current }));
    setContextMenu({ x: e.clientX, y: e.clientY, worktree, agentName });
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

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('worktree-status-card-menu-open', handleOtherMenuOpen);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('worktree-status-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

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
    setContextMenu(null);
    try {
      await invoke('trigger_scheduled_agent', { name: agentName });
      showSuccess(`Triggered ${agentName}`);
    } catch (error) {
      showError(`Failed to trigger ${agentName}: ${error}`);
    }
  };

  const handleRemoveWorktree = async (path: string) => {
    setContextMenu(null);
    try {
      await invoke('remove_worktree', { path });
      showSuccess('Worktree removed');
      fetchWorktrees();
    } catch (error) {
      showError(`Failed to remove worktree: ${error}`);
    }
  };

  const findLinkedPipeline = (branch: string) => {
    return pipelines.find((p) => p.worktree_branch === branch);
  };

  const handlePipelineLink = (pipelineId: string) => {
    setContextMenu(null);
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
              className="p-3 border rounded-lg hover:border-primary/50 transition-colors cursor-context-menu"
              onContextMenu={(e) => handleContextMenu(e, worktree, agentName)}
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
              </div>

              {linkedPipeline && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {linkedPipeline.current_stage}
                  </Badge>
                  <Badge
                    variant={
                      linkedPipeline.status === 'completed' ? 'default' :
                      linkedPipeline.status === 'failed' ? 'destructive' :
                      'secondary'
                    }
                    className="text-xs"
                  >
                    {linkedPipeline.status}
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {contextMenu.agentName && (
            <button
              onClick={() => handleTriggerAgent(contextMenu.agentName!)}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
            >
              <Play className="w-4 h-4" />
              Trigger {contextMenu.agentName}
            </button>
          )}
          {findLinkedPipeline(contextMenu.worktree.branch) && (
            <button
              onClick={() => handlePipelineLink(findLinkedPipeline(contextMenu.worktree.branch)!.id)}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
            >
              <Link2 className="w-4 h-4" />
              View Pipeline
            </button>
          )}
          <div className="border-t border-border my-1" />
          <button
            onClick={() => handleRemoveWorktree(contextMenu.worktree.path)}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Remove Worktree
          </button>
        </div>
      )}
    </Card>
  );
}
