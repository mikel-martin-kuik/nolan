import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { invoke } from '@/lib/api';
import { FeatureRequest, FeatureRequestStatus, STATUS_LABELS } from '@/types';
import { FeatureRequestCard } from './FeatureRequestCard';
import { Loader2 } from 'lucide-react';

type SortOption = 'votes' | 'newest' | 'oldest';

export function FeatureRequestsTab() {
  const [sortBy, setSortBy] = useState<SortOption>('votes');
  const [filterStatus, setFilterStatus] = useState<FeatureRequestStatus | 'all'>('all');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['feature-requests'],
    queryFn: () => invoke<FeatureRequest[]>('list_feature_requests'),
    refetchInterval: 30000,
  });

  const { data: userVotes = {} } = useQuery({
    queryKey: ['user-votes'],
    queryFn: () => invoke<Record<string, string>>('get_user_votes'),
  });

  const filteredAndSorted = useMemo(() => {
    let result = [...requests];

    if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus);
    }

    switch (sortBy) {
      case 'votes':
        result.sort((a, b) => b.votes - a.votes);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
    }

    return result;
  }, [requests, sortBy, filterStatus]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="votes">Most Votes</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as FeatureRequestStatus | 'all')}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Request List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {requests.length === 0
            ? 'No feature requests yet'
            : 'No requests match your filters'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSorted.map((request) => (
            <FeatureRequestCard
              key={request.id}
              request={request}
              userVote={userVotes[request.id] as 'up' | 'down' | undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
