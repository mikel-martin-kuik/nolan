import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Idea, IdeaReview, IdeaComplexity } from '@/types';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailPage } from './IdeaDetailPage';
import { IdeaEditDialog } from './IdeaEditDialog';
import { Button } from '@/components/ui/button';
import { Loader2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
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

interface DispatchResult {
  dispatched: string[];
  already_reviewed: number;
  already_processing: number;
  inactive: number;
}

type WorkflowColumn = 'new' | 'analysis' | 'ready' | 'done';

const COLUMNS: { id: WorkflowColumn; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'ready', label: 'Ready' },
  { id: 'done', label: 'Done' },
];

type ComplexityGroup = IdeaComplexity | 'unknown';
const COMPLEXITY_ORDER: ComplexityGroup[] = ['high', 'medium', 'low', 'unknown'];
const COMPLEXITY_LABELS: Record<ComplexityGroup, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unassessed',
};

function getIdeaColumn(idea: Idea, review?: IdeaReview): WorkflowColumn {
  // Archived ideas go to Done
  if (idea.status === 'archived') {
    return 'done';
  }

  // No review yet = New
  if (!review) {
    return 'new';
  }

  // Check for unanswered required gaps
  const hasUnansweredRequiredGaps = review.gaps?.some(
    (gap) => gap.required && !gap.value
  );

  // Map review status to column
  switch (review.review_status) {
    case 'draft':
      // Draft proposals with unanswered required gaps need user input first
      if (hasUnansweredRequiredGaps) {
        return 'analysis';
      }
      // Draft proposals with all required gaps answered are ready for acceptance
      return 'ready';
    case 'needs_input':
      // Needs user to fill in gaps
      return 'analysis';
    case 'ready':
      // If accepted, it's done; otherwise ready for acceptance
      return review.accepted_at ? 'done' : 'ready';
    case 'rejected':
      return 'done';
    default:
      return 'new';
  }
}

// Check if idea has meaningful review content
function hasReviewContent(review?: IdeaReview): boolean {
  if (!review) return false;
  // All reviews with a proposal have content
  return !!review.proposal;
}

// Export getIdeaColumn for IdeaCard to use
export { getIdeaColumn };

// Droppable column wrapper
interface DroppableColumnProps {
  id: WorkflowColumn;
  children: React.ReactNode;
  className?: string;
}

function DroppableColumn({ id, children, className }: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && 'ring-2 ring-primary/50 ring-inset'
      )}
    >
      {children}
    </div>
  );
}

interface PendingMove {
  idea: Idea;
  review?: IdeaReview;
  from: WorkflowColumn;
  to: WorkflowColumn;
}

export function IdeasTab() {
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [editModalIdea, setEditModalIdea] = useState<Idea | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const toast = useToastStore();
  const queryClient = useQueryClient();

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Dispatch all unreviewed ideas
  const dispatchAllMutation = useMutation({
    mutationFn: () => invoke<DispatchResult>('dispatch_ideas'),
    onSuccess: (result) => {
      if (result.dispatched.length > 0) {
        toast.success(`Dispatched ${result.dispatched.length} idea${result.dispatched.length > 1 ? 's' : ''} for processing`);
      } else {
        toast.info('No new ideas to dispatch');
      }
    },
    onError: (error) => {
      toast.error(`Failed to dispatch: ${error}`);
    },
  });

  // Dispatch single idea (for new → analysis)
  const dispatchSingleMutation = useMutation({
    mutationFn: (ideaId: string) => invoke<string>('dispatch_single_idea', { ideaId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      toast.success('Dispatched for processing');
    },
    onError: (error) => {
      toast.error(`Failed to dispatch: ${error}`);
    },
  });

  // Archive idea (for → done)
  const archiveMutation = useMutation({
    mutationFn: (id: string) => invoke<Idea>('update_idea_status', { id, status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
      toast.success('Idea archived');
    },
    onError: (error) => {
      toast.error(`Failed to archive: ${error}`);
    },
  });

  // Accept and route review (for ready → done)
  const acceptMutation = useMutation({
    mutationFn: (itemId: string) =>
      invoke<{ review: IdeaReview; route: string; route_detail: string }>('accept_and_route_review', { itemId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (result.route === 'project') {
        toast.success(`Created project: ${result.route_detail}`);
      } else {
        toast.success('Idea accepted and queued for implementation');
      }
    },
    onError: (error) => {
      toast.error(`Failed to accept: ${error}`);
    },
  });

  // Delete review (for analysis/ready → new, resets idea)
  const deleteReviewMutation = useMutation({
    mutationFn: (itemId: string) => invoke('delete_idea_review', { itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      toast.success('Idea reset to new');
    },
    onError: (error) => {
      toast.error(`Failed to reset: ${error}`);
    },
  });

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => invoke<Idea[]>('list_ideas'),
    refetchInterval: 30000,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['idea-reviews'],
    queryFn: () => invoke<IdeaReview[]>('list_idea_reviews'),
    refetchInterval: 30000,
  });

  // Create a map of item_id -> review for quick lookup
  const reviewMap = useMemo(() => {
    const map = new Map<string, IdeaReview>();
    reviews.forEach((review) => {
      if (review.item_type === 'idea') {
        map.set(review.item_id, review);
      }
    });
    return map;
  }, [reviews]);

  // Group ideas by column and complexity
  const columnIdeas = useMemo(() => {
    type GroupedByComplexity = Record<ComplexityGroup, { idea: Idea; review?: IdeaReview }[]>;
    const grouped: Record<WorkflowColumn, GroupedByComplexity> = {
      new: { high: [], medium: [], low: [], unknown: [] },
      analysis: { high: [], medium: [], low: [], unknown: [] },
      ready: { high: [], medium: [], low: [], unknown: [] },
      done: { high: [], medium: [], low: [], unknown: [] },
    };

    ideas.forEach((idea) => {
      const review = reviewMap.get(idea.id);
      const column = getIdeaColumn(idea, review);
      const complexity: ComplexityGroup = review?.complexity || 'unknown';
      grouped[column][complexity].push({ idea, review });
    });

    // Sort each group by created_at (newest first)
    Object.values(grouped).forEach((byComplexity) => {
      Object.values(byComplexity).forEach((items) => {
        items.sort((a, b) =>
          new Date(b.idea.created_at).getTime() - new Date(a.idea.created_at).getTime()
        );
      });
    });

    return grouped;
  }, [ideas, reviewMap]);

  // Get total count for a column
  const getColumnCount = (columnId: WorkflowColumn) => {
    return COMPLEXITY_ORDER.reduce(
      (sum, complexity) => sum + columnIdeas[columnId][complexity].length,
      0
    );
  };

  // Handle card click - modal for new ideas, page for reviewed ones
  const handleCardClick = (idea: Idea, review?: IdeaReview) => {
    if (hasReviewContent(review)) {
      // Has review content - go to detail page
      setSelectedIdeaId(idea.id);
    } else {
      // New idea without review - open edit modal
      setEditModalIdea(idea);
    }
  };

  // Get the active dragging idea
  const activeIdea = activeId ? ideas.find((i) => i.id === activeId) : null;
  const activeReview = activeId ? reviewMap.get(activeId) : undefined;

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Execute a move (called after validation/confirmation)
  const executeMove = (idea: Idea, review: IdeaReview | undefined, from: WorkflowColumn, to: WorkflowColumn) => {
    // new → analysis: dispatch for processing
    if (from === 'new' && to === 'analysis') {
      dispatchSingleMutation.mutate(idea.id);
      return;
    }

    // analysis → new or ready → new: reset by deleting review (requires confirmation)
    if ((from === 'analysis' || from === 'ready') && to === 'new') {
      deleteReviewMutation.mutate(idea.id);
      return;
    }

    // ready → done: accept and route
    if (from === 'ready' && to === 'done') {
      // Check for required gaps
      const hasUnansweredRequiredGaps = review?.gaps?.some((g) => g.required && !g.value?.trim());
      if (hasUnansweredRequiredGaps) {
        toast.error('Fill all required gaps before accepting');
        return;
      }
      acceptMutation.mutate(idea.id);
      return;
    }

    // any → done (archive): allowed per user preference
    if (to === 'done') {
      archiveMutation.mutate(idea.id);
      return;
    }

    // Same column = no-op
    if (from === to) {
      return;
    }

    // Default: not a valid transition
    toast.error(`Cannot move from ${from} to ${to}`);
  };

  // Validate and handle drop
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const ideaId = active.id as string;
    const targetColumn = over.id as WorkflowColumn;

    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;

    const review = reviewMap.get(ideaId);
    const currentColumn = getIdeaColumn(idea, review);

    // Same column = no action
    if (currentColumn === targetColumn) return;

    // done → anywhere: archived items stay archived
    if (currentColumn === 'done') {
      toast.error('Archived items cannot be moved');
      return;
    }

    // analysis/ready → new: requires confirmation (would lose review work)
    if ((currentColumn === 'analysis' || currentColumn === 'ready') && targetColumn === 'new') {
      setPendingMove({ idea, review, from: currentColumn, to: targetColumn });
      return;
    }

    // Execute the move
    executeMove(idea, review, currentColumn, targetColumn);
  };

  // Confirm destructive move
  const confirmMove = () => {
    if (pendingMove) {
      executeMove(pendingMove.idea, pendingMove.review, pendingMove.from, pendingMove.to);
      setPendingMove(null);
    }
  };

  // Cancel pending move
  const cancelMove = () => {
    setPendingMove(null);
  };

  // Find selected idea and review for detail page
  const selectedIdea = selectedIdeaId ? ideas.find((i) => i.id === selectedIdeaId) : null;
  const selectedReview = selectedIdeaId ? reviewMap.get(selectedIdeaId) : undefined;

  // Show detail page if an idea with review is selected
  if (selectedIdea && hasReviewContent(selectedReview)) {
    return (
      <IdeaDetailPage
        idea={selectedIdea}
        review={selectedReview}
        onBack={() => setSelectedIdeaId(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Count ideas that would be dispatched (active + no review)
  const dispatchableCount = ideas.filter(
    (idea) => idea.status === 'active' && !reviewMap.has(idea.id)
  ).length;

  return (
    <div className="space-y-3">
      {/* Header with dispatch button */}
      {dispatchableCount > 0 && (
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatchAllMutation.mutate()}
            disabled={dispatchAllMutation.isPending}
            className="text-xs gap-1.5"
          >
            {dispatchAllMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Dispatch All ({dispatchableCount})
          </Button>
        </div>
      )}

      {/* Kanban Board with Drag and Drop */}
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-4 gap-3">
          {COLUMNS.map((column) => (
            <div key={column.id} className="space-y-2">
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {column.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {getColumnCount(column.id)}
                </span>
              </div>

              {/* Droppable Column Content */}
              <DroppableColumn
                id={column.id}
                className={cn(
                  'glass-card no-hover min-h-[200px] rounded-xl p-2',
                  column.id === 'done' && 'opacity-60'
                )}
              >
                {getColumnCount(column.id) === 0 ? (
                  <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground/50">
                    Empty
                  </div>
                ) : (
                  <div className="space-y-2">
                    {COMPLEXITY_ORDER.map((complexity) => {
                      const items = columnIdeas[column.id][complexity];
                      if (items.length === 0) return null;

                      const sectionKey = `${column.id}-${complexity}`;
                      const isCollapsed = collapsedSections.has(sectionKey);

                      return (
                        <div key={complexity}>
                          {/* Complexity Header */}
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className="flex items-center gap-1 w-full text-left py-1 px-1 hover:bg-muted/50 rounded text-[10px] text-muted-foreground"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            <span>{COMPLEXITY_LABELS[complexity]}</span>
                            <span className="ml-auto">{items.length}</span>
                          </button>

                          {/* Items */}
                          {!isCollapsed && (
                            <div className="space-y-1.5 mt-1">
                              {items.map(({ idea, review }) => (
                                <IdeaCard
                                  key={idea.id}
                                  idea={idea}
                                  review={review}
                                  onClick={() => handleCardClick(idea, review)}
                                  isDragging={activeId === idea.id}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </DroppableColumn>
            </div>
          ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeIdea && (
            <IdeaCard
              idea={activeIdea}
              review={activeReview}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Confirmation dialog for destructive moves */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && cancelMove()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Idea?</AlertDialogTitle>
            <AlertDialogDescription>
              Moving this idea back to "New" will delete the review and any analysis work.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Modal for new ideas */}
      <IdeaEditDialog
        idea={editModalIdea}
        open={!!editModalIdea}
        onOpenChange={(open) => !open && setEditModalIdea(null)}
      />
    </div>
  );
}
