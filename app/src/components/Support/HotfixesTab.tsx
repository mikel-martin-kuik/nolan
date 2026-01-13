import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Hotfix, HOTFIX_STATUS_LABELS, HOTFIX_STATUS_COLORS } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Play, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  in_progress: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

export function HotfixesTab() {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: hotfixes = [], isLoading } = useQuery({
    queryKey: ['hotfixes'],
    queryFn: () => invoke<Hotfix[]>('list_hotfixes'),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoke('delete_hotfix', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotfixes'] });
      addToast('success', 'Hotfix deleted');
      setDeleteId(null);
    },
    onError: (error: Error) => {
      addToast('error', error.message);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      invoke<Hotfix>('update_hotfix_status', { id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotfixes'] });
      addToast('success', 'Status updated');
    },
    onError: (error: Error) => {
      addToast('error', error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group hotfixes by status
  const pendingHotfixes = hotfixes.filter(h => h.status === 'pending');
  const inProgressHotfixes = hotfixes.filter(h => h.status === 'in_progress');
  const completedHotfixes = hotfixes.filter(h => h.status === 'completed' || h.status === 'failed');

  const renderHotfix = (hotfix: Hotfix) => {
    const StatusIcon = STATUS_ICONS[hotfix.status] || Clock;
    const isExpanded = expandedId === hotfix.id;

    return (
      <div
        key={hotfix.id}
        className="glass-card p-3 rounded-lg space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <StatusIcon
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  hotfix.status === 'in_progress' && 'animate-spin',
                  hotfix.status === 'completed' && 'text-green-500',
                  hotfix.status === 'failed' && 'text-red-500',
                  hotfix.status === 'pending' && 'text-slate-500'
                )}
              />
              <button
                onClick={() => setExpandedId(isExpanded ? null : hotfix.id)}
                className="font-medium text-sm truncate hover:text-foreground text-left"
              >
                {hotfix.title}
              </button>
            </div>
            {isExpanded && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {hotfix.description}
                </p>
                {hotfix.scope.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {hotfix.scope.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {hotfix.error && (
                  <p className="text-xs text-red-500">{hotfix.error}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge className={cn('text-[10px]', HOTFIX_STATUS_COLORS[hotfix.status])}>
              {HOTFIX_STATUS_LABELS[hotfix.status]}
            </Badge>
            {hotfix.status === 'pending' && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => updateStatusMutation.mutate({ id: hotfix.id, status: 'in_progress' })}
                title="Start"
              >
                <Play className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteId(hotfix.id)}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>{hotfixes.length} total</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{pendingHotfixes.length} pending</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span>{completedHotfixes.filter(h => h.status === 'completed').length} done</span>
        </div>
      </div>

      {hotfixes.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hotfixes in queue</p>
          <p className="text-xs mt-1">
            Hotfixes are simple fixes that bypass the full idea pipeline
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {pendingHotfixes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pending ({pendingHotfixes.length})
              </h3>
              <div className="space-y-2">
                {pendingHotfixes.map(renderHotfix)}
              </div>
            </div>
          )}

          {/* In Progress */}
          {inProgressHotfixes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-blue-500 uppercase tracking-wider">
                In Progress ({inProgressHotfixes.length})
              </h3>
              <div className="space-y-2">
                {inProgressHotfixes.map(renderHotfix)}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedHotfixes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completed ({completedHotfixes.length})
              </h3>
              <div className="space-y-2 opacity-75">
                {completedHotfixes.map(renderHotfix)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hotfix?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the hotfix from the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
