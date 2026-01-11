import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { FeedbackStats } from '@/types';
import { FeatureRequestsTab } from './FeatureRequestsTab';
import { IdeasTab } from './IdeasTab';
import { IdeaForm } from './IdeaForm';
import { FeatureRequestForm } from './FeatureRequestForm';
import { RoadmapViewer } from '../Projects/RoadmapViewer';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

type TabType = 'requests' | 'ideas' | 'roadmap';

export function SupportPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [ideaFormOpen, setIdeaFormOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);

  const handleNewClick = () => {
    if (activeTab === 'ideas') {
      setIdeaFormOpen(true);
    } else if (activeTab === 'requests') {
      setRequestFormOpen(true);
    }
    // No action for roadmap tab
  };

  const { data: stats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => invoke<FeedbackStats>('get_feedback_stats'),
    refetchInterval: 30000,
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header with New Button and Tabs */}
      <div className="flex items-center gap-2">
        {activeTab !== 'roadmap' && (
          <Button size="sm" onClick={handleNewClick}>
            New
          </Button>
        )}
        <div className="flex items-center gap-1 p-1 glass-card rounded-lg">
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
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
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
              activeTab === 'ideas' && "bg-foreground/10 text-foreground",
              activeTab !== 'ideas' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Ideas</span>
            {(stats?.total_ideas ?? 0) > 0 && (
              <span className="text-[10px] px-1 rounded bg-foreground/10">
                {stats?.total_ideas}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
              activeTab === 'roadmap' && "bg-foreground/10 text-foreground",
              activeTab !== 'roadmap' && "text-muted-foreground hover:text-foreground"
            )}
          >
            <Compass className="w-3 h-3" />
            <span>Roadmap</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'requests' && <FeatureRequestsTab />}
        {activeTab === 'ideas' && <IdeasTab />}
        {activeTab === 'roadmap' && <RoadmapViewer />}
      </div>

      <IdeaForm open={ideaFormOpen} onOpenChange={setIdeaFormOpen} />
      <FeatureRequestForm open={requestFormOpen} onOpenChange={setRequestFormOpen} />
    </div>
  );
}
