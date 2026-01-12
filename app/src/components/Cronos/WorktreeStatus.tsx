import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GitBranch, Trash2, RefreshCw, FolderOpen } from 'lucide-react';

interface WorktreeListEntry {
  path: string;
  commit: string;
  branch: string;
  is_bare: boolean;
  is_detached: boolean;
}

interface WorktreeStatusProps {
  refreshInterval?: number;
}

export const WorktreeStatus: React.FC<WorktreeStatusProps> = ({
  refreshInterval = 30000,
}) => {
  const [worktrees, setWorktrees] = useState<WorktreeListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<WorktreeListEntry[]>('list_worktrees');
      // Filter to only show worktree/* branches (created by agents)
      const agentWorktrees = result.filter(w =>
        w.branch.startsWith('worktree/') && !w.is_bare
      );
      setWorktrees(agentWorktrees);
    } catch (err) {
      console.error('Failed to load worktrees:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
    const interval = setInterval(loadWorktrees, refreshInterval);
    return () => clearInterval(interval);
  }, [loadWorktrees, refreshInterval]);

  const handleRemove = useCallback(async (path: string) => {
    try {
      await invoke('remove_worktree', { path, force: false });
      setDeleteConfirm(null);
      loadWorktrees();
    } catch (err) {
      console.error('Failed to remove worktree:', err);
      // Try force remove
      try {
        await invoke('remove_worktree', { path, force: true });
        setDeleteConfirm(null);
        loadWorktrees();
      } catch (forceErr) {
        console.error('Force remove also failed:', forceErr);
      }
    }
  }, [loadWorktrees]);

  const handleCleanup = useCallback(async () => {
    try {
      await invoke('cleanup_worktrees');
      loadWorktrees();
    } catch (err) {
      console.error('Failed to cleanup worktrees:', err);
    }
  }, [loadWorktrees]);

  // Extract agent name and run_id from branch name: worktree/{agent}/{run_id}
  const parseBranch = (branch: string): { agent: string; runId: string } => {
    const parts = branch.replace('worktree/', '').split('/');
    return {
      agent: parts[0] || 'unknown',
      runId: parts[1] || 'unknown',
    };
  };

  if (worktrees.length === 0) {
    return null; // Don't render if no worktrees
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Active Worktrees
          <Badge variant="secondary" className="text-xs">
            {worktrees.length}
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCleanup}
            title="Prune stale worktrees"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadWorktrees}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-4">
        <div className="space-y-2">
          {worktrees.map((wt) => {
            const { agent, runId } = parseBranch(wt.branch);
            return (
              <div
                key={wt.path}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{agent}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {runId}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <FolderOpen className="h-3 w-3" />
                    <span className="truncate">{wt.path}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    commit: {wt.commit.slice(0, 8)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(wt.path)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Remove worktree"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>

      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Worktree?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the worktree directory and delete the associated branch.
              Any uncommitted changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleRemove(deleteConfirm)}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
