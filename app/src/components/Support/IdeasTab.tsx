import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Idea, IdeaReview } from '@/types';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailPage } from './IdeaDetailPage';
import { IdeaEditDialog } from './IdeaEditDialog';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type WorkflowColumn = 'new' | 'analysis' | 'ready' | 'done';

const COLUMNS: { id: WorkflowColumn; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'ready', label: 'Ready' },
  { id: 'done', label: 'Done' },
];

function getIdeaColumn(idea: Idea, review?: IdeaReview): WorkflowColumn {
  // Archived ideas go to Done
  if (idea.status === 'archived') {
    return 'done';
  }

  // No review yet = New
  if (!review) {
    return 'new';
  }

  // Map review status to column
  switch (review.review_status) {
    case 'draft':
      return 'new';
    case 'needs_input':
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

// Check if idea has meaningful review content (not just draft)
function hasReviewContent(review?: IdeaReview): boolean {
  if (!review) return false;
  // Draft reviews don't have content yet, treat as new
  if (review.review_status === 'draft') return false;
  return true;
}

export function IdeasTab() {
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [editModalIdea, setEditModalIdea] = useState<Idea | null>(null);

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

  // Group ideas by column
  const columnIdeas = useMemo(() => {
    const grouped: Record<WorkflowColumn, { idea: Idea; review?: IdeaReview }[]> = {
      new: [],
      analysis: [],
      ready: [],
      done: [],
    };

    ideas.forEach((idea) => {
      const review = reviewMap.get(idea.id);
      const column = getIdeaColumn(idea, review);
      grouped[column].push({ idea, review });
    });

    // Sort each column by created_at (newest first)
    Object.values(grouped).forEach((items) => {
      items.sort((a, b) =>
        new Date(b.idea.created_at).getTime() - new Date(a.idea.created_at).getTime()
      );
    });

    return grouped;
  }, [ideas, reviewMap]);

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

  return (
    <div className="space-y-3">
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
                {columnIdeas[column.id].length}
              </span>
            </div>

            {/* Column Content */}
            <div
              className={cn(
                'glass-card no-hover min-h-[200px] space-y-1.5 rounded-xl p-2',
                column.id === 'done' && 'opacity-60'
              )}
            >
              {columnIdeas[column.id].length === 0 ? (
                <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground/50">
                  Empty
                </div>
              ) : (
                columnIdeas[column.id].map(({ idea, review }) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    review={review}
                    onClick={() => handleCardClick(idea, review)}
                  />
                ))
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
