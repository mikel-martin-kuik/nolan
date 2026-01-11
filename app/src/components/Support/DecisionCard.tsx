import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { invoke } from '@/lib/api';
import {
  TeamDecision,
  DecisionStatus,
  DECISION_STATUS_LABELS,
  DECISION_STATUS_COLORS,
} from '@/types';
import { MoreVertical, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface DecisionCardProps {
  decision: TeamDecision;
}

const ALL_STATUSES: DecisionStatus[] = ['proposed', 'in_review', 'approved', 'deprecated', 'superseded'];

export function DecisionCard({ decision }: DecisionCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      invoke<TeamDecision>('update_decision_status', { id: decision.id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      invoke<TeamDecision>('approve_decision', { id: decision.id, approvedBy: 'user' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
  });

  const deprecateMutation = useMutation({
    mutationFn: () => invoke<TeamDecision>('deprecate_decision', { id: decision.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoke('delete_decision', { id: decision.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
  });

  const createdAt = formatRelativeTime(decision.created_at);
  const canApprove = decision.status === 'proposed' || decision.status === 'in_review';

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Status indicator */}
          <div className="flex flex-col items-center gap-0.5 pt-0.5">
            <div className={cn(
              'w-2 h-2 rounded-full',
              decision.status === 'approved' && 'bg-green-500',
              decision.status === 'proposed' && 'bg-blue-500',
              decision.status === 'in_review' && 'bg-amber-500',
              decision.status === 'deprecated' && 'bg-slate-500',
              decision.status === 'superseded' && 'bg-purple-500'
            )} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium truncate">{decision.title}</h3>
                  <Badge className={cn('text-[10px] px-1.5 py-0', DECISION_STATUS_COLORS[decision.status])}>
                    {DECISION_STATUS_LABELS[decision.status]}
                  </Badge>
                </div>

                {/* Scope tag */}
                {decision.scope && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {decision.team_id}{decision.agent_id && ` / ${decision.agent_id}`}
                  </div>
                )}

                {/* Problem statement */}
                <p
                  className={cn(
                    'text-xs text-muted-foreground mt-1',
                    !expanded && 'line-clamp-2'
                  )}
                >
                  <span className="font-medium">Problem:</span> {decision.problem}
                </p>

                {/* Solution */}
                {expanded && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Solution:</span> {decision.proposed_solution}
                    </p>
                    {decision.rationale && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Rationale:</span> {decision.rationale}
                      </p>
                    )}
                    {decision.alternatives.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Alternatives considered:</span>
                        <ul className="list-disc list-inside ml-2">
                          {decision.alternatives.map((alt, i) => (
                            <li key={i}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {decision.impact && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Impact:</span> {decision.impact}
                      </p>
                    )}
                  </>
                )}

                {(decision.problem.length > 100 || decision.proposed_solution) && (
                  <button
                    className="text-[10px] text-primary hover:underline mt-0.5"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? 'less' : 'more'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                {canApprove && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-green-500 hover:text-green-600"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {ALL_STATUSES.map((status) => (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => statusMutation.mutate(status)}
                        disabled={decision.status === status}
                        className="text-xs"
                      >
                        {DECISION_STATUS_LABELS[status]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    {decision.status === 'approved' && (
                      <DropdownMenuItem
                        onClick={() => deprecateMutation.mutate()}
                        className="text-xs"
                      >
                        Deprecate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-xs text-destructive"
                      onClick={() => {
                        if (confirm('Delete this decision?')) {
                          deleteMutation.mutate();
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground mt-1.5">
              {createdAt}
              {decision.approved_at && (
                <span className="ml-2">• Approved {formatRelativeTime(decision.approved_at)}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
