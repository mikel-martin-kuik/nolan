import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { FeedbackStats, Idea, IdeaReview, TeamDecision, Hotfix } from '@/types';
import { FeatureRequestsTab } from './FeatureRequestsTab';
import { IdeasTab } from './IdeasTab';
import { HotfixesTab } from './HotfixesTab';
import { DecisionsTab } from './DecisionsTab';
import { IdeaForm } from './IdeaForm';
import { FeatureRequestForm } from './FeatureRequestForm';
import { DecisionForm } from './DecisionForm';
import { RoadmapViewer } from '../Projects/RoadmapViewer';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Compass, FileCheck, Zap } from 'lucide-react';

type TabType = 'requests' | 'ideas' | 'hotfixes' | 'decisions' | 'roadmap';

export function SupportPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [ideaFormOpen, setIdeaFormOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [decisionFormOpen, setDecisionFormOpen] = useState(false);

  const handleNewClick = () => {
    if (activeTab === 'ideas') {
      setIdeaFormOpen(true);
    } else if (activeTab === 'requests') {
      setRequestFormOpen(true);
    } else if (activeTab === 'decisions') {
      setDecisionFormOpen(true);
    }
    // No action for roadmap tab
  };

  const { data: stats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => invoke<FeedbackStats>('get_feedback_stats'),
    refetchInterval: 30000,
  });

  const { data: ideas = [] } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => invoke<Idea[]>('list_ideas'),
    refetchInterval: 30000,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['idea-reviews'],
    queryFn: () => invoke<IdeaReview[]>('list_idea_reviews'),
    refetchInterval: 30000,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['decisions'],
    queryFn: () => invoke<TeamDecision[]>('list_decisions'),
    refetchInterval: 30000,
  });

  const { data: hotfixes = [] } = useQuery({
    queryKey: ['hotfixes'],
    queryFn: () => invoke<Hotfix[]>('list_hotfixes'),
    refetchInterval: 30000,
  });

  // Count pending hotfixes
  const pendingHotfixesCount = useMemo(() => {
    return hotfixes.filter(h => h.status === 'pending').length;
  }, [hotfixes]);

  // Count approved decisions
  const approvedDecisionsCount = useMemo(() => {
    return decisions.filter(d => d.status === 'approved').length;
  }, [decisions]);

  // Count ideas that are not in "done" column
  const pendingIdeasCount = useMemo(() => {
    const reviewMap = new Map<string, IdeaReview>();
    reviews.forEach((review) => {
      if (review.item_type === 'idea') {
        reviewMap.set(review.item_id, review);
      }
    });

    return ideas.filter((idea) => {
      // Archived ideas are done
      if (idea.status === 'archived') return false;

      const review = reviewMap.get(idea.id);
      if (!review) return true; // No review = not done

      // Check if done based on review status
      if (review.review_status === 'rejected') return false;
      if (review.review_status === 'ready' && review.accepted_at) return false;

      return true;
    }).length;
  }, [ideas, reviews]);

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-4">
      {/* Header with New Button and Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {activeTab !== 'roadmap' && activeTab !== 'hotfixes' && (
          <Button size="sm" onClick={handleNewClick} className="w-full sm:w-auto">
            New
          </Button>
        )}
        <div className="flex items-center gap-1 p-1 glass-card rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
              activeTab === 'requests' && "bg-foreground/10 text-foreground",
              activeTab !== 'requests' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Requests</span>
            {(stats?.total_requests ?? 0) > 0 && (
              <span className="text-[10px] px-1 rounded bg-foreground/10">
                {stats?.total_requests}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ideas')}
            className={cn(
              "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
              activeTab === 'ideas' && "bg-foreground/10 text-foreground",
              activeTab !== 'ideas' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Ideas</span>
            {pendingIdeasCount > 0 && (
              <span className="text-[10px] px-1 rounded bg-foreground/10">
                {pendingIdeasCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('hotfixes')}
            className={cn(
              "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
              activeTab === 'hotfixes' && "bg-foreground/10 text-foreground",
              activeTab !== 'hotfixes' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-3 h-3 hidden sm:block" />
            <span>Hotfixes</span>
            {pendingHotfixesCount > 0 && (
              <span className="text-[10px] px-1 rounded bg-foreground/10">
                {pendingHotfixesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('decisions')}
            className={cn(
              "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
              activeTab === 'decisions' && "bg-foreground/10 text-foreground",
              activeTab !== 'decisions' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileCheck className="w-3 h-3 hidden sm:block" />
            <span>Decisions</span>
            {approvedDecisionsCount > 0 && (
              <span className="text-[10px] px-1 rounded bg-foreground/10">
                {approvedDecisionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={cn(
              "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
              activeTab === 'roadmap' && "bg-foreground/10 text-foreground",
              activeTab !== 'roadmap' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <Compass className="w-3 h-3 hidden sm:block" />
            <span>Roadmap</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'requests' && <FeatureRequestsTab />}
        {activeTab === 'ideas' && <IdeasTab />}
        {activeTab === 'hotfixes' && <HotfixesTab />}
        {activeTab === 'decisions' && <DecisionsTab />}
        {activeTab === 'roadmap' && <RoadmapViewer />}
      </div>

      <IdeaForm open={ideaFormOpen} onOpenChange={setIdeaFormOpen} />
      <FeatureRequestForm open={requestFormOpen} onOpenChange={setRequestFormOpen} />
      <DecisionForm open={decisionFormOpen} onOpenChange={setDecisionFormOpen} />
    </div>
  );
}
