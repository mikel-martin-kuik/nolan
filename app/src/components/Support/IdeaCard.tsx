import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { invoke } from '@/lib/api';
import { Idea, IdeaReview } from '@/types';
import type { ProjectInfo } from '@/types/projects';
import { cn } from '@/lib/utils';
import { IdeaEditDialog } from './IdeaEditDialog';
import { TeamLaunchModal } from '@/components/shared/TeamLaunchModal';
import { useToastStore } from '@/store/toastStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useAgentStore } from '@/store/agentStore';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface IdeaCardProps {
  idea: Idea;
  review?: IdeaReview;
  onClick?: () => void;
  isDragging?: boolean;
  isDragOverlay?: boolean;
}

export function IdeaCard({ idea, review, onClick, isDragging, isDragOverlay }: IdeaCardProps) {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const { navigateTo } = useNavigationStore();
  const { launchTeam } = useAgentStore();
  const [editOpen, setEditOpen] = useState(false);
  const [teamLaunchOpen, setTeamLaunchOpen] = useState(false);
  const [pendingProjectName, setPendingProjectName] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: idea.id,
    disabled: isDragOverlay,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  const acceptMutation = useMutation({
    mutationFn: () => invoke<{ review: IdeaReview; route: string; route_detail: string }>('accept_and_route_review', { item_id: idea.id }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (result.route === 'project') {
        // High complexity: show team selection modal
        setPendingProjectName(result.route_detail);
        setTeamLaunchOpen(true);
      } else {
        toast.success(`Idea accepted and queued for implementation`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to accept idea: ${error}`);
    },
  });

  const handleTeamLaunch = async (teamName: string) => {
    setIsLaunching(true);
    try {
      await launchTeam(teamName, pendingProjectName);
      toast.success(`Launched ${teamName} team for project: ${pendingProjectName}`);
      setTeamLaunchOpen(false);
      // Navigate to the project via files tab (get project path from list_projects)
      const projects = await invoke<ProjectInfo[]>('list_projects');
      const project = projects.find(p => p.name === pendingProjectName);
      if (project) {
        navigateTo('files', { filePath: project.path });
      }
    } catch (error) {
      toast.error(`Failed to launch team: ${error}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const archiveMutation = useMutation({
    mutationFn: () => invoke<Idea>('update_idea_status', { id: idea.id, status: 'archived' }),
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

  const dispatchMutation = useMutation({
    mutationFn: () => invoke<string>('dispatch_single_idea', { idea_id: idea.id }),
    onSuccess: () => {
      toast.success(`Dispatched "${idea.title}" for processing`);
    },
    onError: (error) => {
      toast.error(`Failed to dispatch: ${error}`);
    },
  });

  const createdAt = formatRelativeTime(idea.created_at);
  const isArchived = idea.status === 'archived';
  const isReady = review?.review_status === 'ready' && !review.accepted_at;
  const isAccepted = review?.accepted_at;
  const needsInput = review?.review_status === 'needs_input';
  const gapsCount = review?.gaps?.filter((g) => g.required && !g.value?.trim()).length || 0;

  const handleAccept = () => {
    if (review && !review.accepted_at) {
      acceptMutation.mutate();
    }
  };

  const handleReject = () => {
    setEditOpen(true);
  };

  const handleDelete = () => {
    if (confirm('Delete this idea?')) {
      deleteMutation.mutate();
    }
  };

  const handleArchive = () => {
    archiveMutation.mutate();
  };

  // Can accept if there's a review that's ready and all gaps are filled
  const canAccept = review && !review.accepted_at && review.review_status !== 'rejected';
  const allGapsFilled = !review?.gaps?.some((g) => g.required && !g.value?.trim());

  // Can dispatch if active and no review yet
  const canDispatch = idea.status === 'active' && !review;

  const handleDispatch = () => {
    dispatchMutation.mutate();
  };

  // Navigate to project if route is 'project'
  const handleGoToProject = async () => {
    if (review?.route === 'project' && review?.route_detail) {
      try {
        const projects = await invoke<ProjectInfo[]>('list_projects');
        const project = projects.find(p => p.name === review.route_detail);
        if (project) {
          navigateTo('files', { filePath: project.path });
        }
      } catch (error) {
        console.error('Failed to navigate to project:', error);
      }
    }
  };

  // Navigate to implementer log if route is 'implementer'
  const handleGoToImplementerLog = () => {
    if (review?.route === 'implementer') {
      navigateTo('cronos', { cronAgentName: 'cron-idea-implementer' });
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={setNodeRef}
            style={style}
            onClick={onClick}
            className={cn(
              'w-full text-left px-2.5 py-2 glass-card rounded-lg transition-all duration-200',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'touch-none cursor-pointer',
              isArchived && 'opacity-50',
              isDragging && 'opacity-30',
              isDragOverlay && 'shadow-lg ring-2 ring-primary/50'
            )}
            {...listeners}
            {...attributes}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium truncate flex-1">
                {idea.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {createdAt}
              </span>
            </div>
            {/* Subtle status indicator */}
            {needsInput && gapsCount > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {gapsCount} gap{gapsCount > 1 ? 's' : ''}
              </div>
            )}
            {isReady && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Ready to accept
              </div>
            )}
            {isAccepted && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Accepted
              </div>
            )}
          </button>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {canDispatch && (
            <ContextMenuItem
              onClick={handleDispatch}
              disabled={dispatchMutation.isPending}
              className="text-xs"
            >
              {dispatchMutation.isPending ? 'Dispatching...' : 'Dispatch for Review'}
            </ContextMenuItem>
          )}
          {canAccept && (
            <ContextMenuItem
              onClick={handleAccept}
              disabled={!allGapsFilled}
              className="text-xs"
            >
              Accept
              {!allGapsFilled && <span className="ml-auto text-[10px] text-muted-foreground">fill gaps</span>}
            </ContextMenuItem>
          )}
          {review?.route === 'project' && review?.route_detail && (
            <ContextMenuItem onClick={handleGoToProject} className="text-xs">
              Go to Project
            </ContextMenuItem>
          )}
          {review?.route === 'implementer' && (
            <ContextMenuItem onClick={handleGoToImplementerLog} className="text-xs">
              Go to Implementer Log
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={handleReject} className="text-xs">
            {review ? 'Reject & Edit' : 'Edit'}
          </ContextMenuItem>
          {!isArchived && (
            <ContextMenuItem onClick={handleArchive} className="text-xs">
              Archive
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-xs text-destructive">
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <IdeaEditDialog idea={idea} open={editOpen} onOpenChange={setEditOpen} />

      <TeamLaunchModal
        open={teamLaunchOpen}
        onOpenChange={setTeamLaunchOpen}
        onLaunch={handleTeamLaunch}
        projectName={pendingProjectName}
        isLaunching={isLaunching}
      />
    </>
  );
}
