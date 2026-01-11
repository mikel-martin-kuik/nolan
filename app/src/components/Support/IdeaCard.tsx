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
import { Idea } from '@/types';
import { MoreVertical } from 'lucide-react';

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

interface IdeaCardProps {
  idea: Idea;
}

export function IdeaCard({ idea }: IdeaCardProps) {
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      invoke<Idea>('update_idea_status', { id: idea.id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => invoke('delete_idea', { id: idea.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
  });

  const createdAt = formatRelativeTime(idea.created_at);
  const isArchived = idea.status === 'archived';

  return (
    <Card className={isArchived ? 'opacity-50' : undefined}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium truncate">{idea.title}</h3>
              {isArchived && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Archived
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
              {idea.description}
            </p>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {createdAt}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => statusMutation.mutate(isArchived ? 'active' : 'archived')}
                className="text-xs"
              >
                {isArchived ? 'Restore' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs text-destructive"
                onClick={() => {
                  if (confirm('Delete this idea?')) {
                    deleteMutation.mutate();
                  }
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
