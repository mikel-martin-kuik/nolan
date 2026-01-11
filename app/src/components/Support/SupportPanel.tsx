import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { FeedbackStats } from '@/types';
import { FeatureRequestsTab } from './FeatureRequestsTab';
import { IdeasTab } from './IdeasTab';
import { cn } from '@/lib/utils';

type TabType = 'requests' | 'ideas';

export function SupportPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('requests');

  const { data: stats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => invoke<FeedbackStats>('get_feedback_stats'),
    refetchInterval: 30000,
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 bg-card/50 backdrop-blur rounded-lg border border-border/50 w-fit">
        <button
          onClick={() => setActiveTab('requests')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all",
            activeTab === 'requests' && "bg-foreground/10 text-foreground",
            activeTab !== 'requests' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Requests</span>
          {(stats?.total_requests ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 rounded bg-foreground/10">
              {stats?.total_requests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('ideas')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all",
            activeTab === 'ideas' && "bg-foreground/10 text-foreground",
            activeTab !== 'ideas' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Ideas</span>
          {(stats?.total_ideas ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 rounded bg-foreground/10">
              {stats?.total_ideas}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'requests' && <FeatureRequestsTab />}
        {activeTab === 'ideas' && <IdeasTab />}
      </div>
    </div>
  );
}
