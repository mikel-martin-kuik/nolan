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
  FeatureRequest,
  FeatureRequestStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/types';
import { MoreVertical } from 'lucide-react';
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

interface FeatureRequestCardProps {
  request: FeatureRequest;
  userVote?: 'up' | 'down' | null;
}

const ALL_STATUSES: FeatureRequestStatus[] = ['new', 'reviewed', 'designed', 'done', 'rejected'];

export function FeatureRequestCard({ request, userVote }: FeatureRequestCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const voteMutation = useMutation({
    mutationFn: (voteType: 'up' | 'down') =>
      invoke<FeatureRequest>('vote_feature_request', { id: request.id, vote_type: voteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      invoke<FeatureRequest>('update_feature_request_status', { id: request.id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoke('delete_feature_request', { id: request.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });

  const createdAt = formatRelativeTime(request.created_at);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Vote controls */}
          <div className="flex flex-col items-center gap-0.5 pt-0.5">
            <button
              className={cn(
                'text-lg leading-none hover:text-foreground transition-colors',
                userVote === 'up' ? 'text-green-500' : 'text-muted-foreground/50'
              )}
              onClick={() => voteMutation.mutate('up')}
              disabled={voteMutation.isPending}
            >
              ▲
            </button>
            <span className={cn(
              'text-xs font-medium tabular-nums',
              request.votes > 0 && 'text-green-600',
              request.votes < 0 && 'text-red-500',
              request.votes === 0 && 'text-muted-foreground'
            )}>
              {request.votes}
            </span>
            <button
              className={cn(
                'text-lg leading-none hover:text-foreground transition-colors',
                userVote === 'down' ? 'text-red-500' : 'text-muted-foreground/50'
              )}
              onClick={() => voteMutation.mutate('down')}
              disabled={voteMutation.isPending}
            >
              ▼
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium truncate">{request.title}</h3>
                  <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_COLORS[request.status])}>
                    {STATUS_LABELS[request.status]}
                  </Badge>
                </div>
                <p
                  className={cn(
                    'text-xs text-muted-foreground mt-1',
                    !expanded && 'line-clamp-2'
                  )}
                >
                  {request.description}
                </p>
                {request.description.length > 150 && (
                  <button
                    className="text-[10px] text-primary hover:underline mt-0.5"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? 'less' : 'more'}
                  </button>
                )}
              </div>

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
                      disabled={request.status === status}
                      className="text-xs"
                    >
                      {STATUS_LABELS[status]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs text-destructive"
                    onClick={() => {
                      if (confirm('Delete this request?')) {
                        deleteMutation.mutate();
                      }
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="text-[10px] text-muted-foreground mt-1.5">
              {createdAt}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
