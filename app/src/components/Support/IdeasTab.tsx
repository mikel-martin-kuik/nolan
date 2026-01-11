import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Idea, IdeaReview, IdeaComplexity } from '@/types';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailPage } from './IdeaDetailPage';
import { IdeaEditDialog } from './IdeaEditDialog';
import { Button } from '@/components/ui/button';
import { Loader2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';

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

export function IdeasTab() {
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [editModalIdea, setEditModalIdea] = useState<Idea | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toast = useToastStore();

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

      {/* Kanban Board */}
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

            {/* Column Content */}
            <div
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
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal for new ideas */}
      <IdeaEditDialog
        idea={editModalIdea}
        open={!!editModalIdea}
        onOpenChange={(open) => !open && setEditModalIdea(null)}
      />
    </div>
  );
}
