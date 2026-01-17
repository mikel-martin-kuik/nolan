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
import { TeamDecision, DecisionStatus, DECISION_STATUS_LABELS } from '@/types';
import { DecisionCard } from './DecisionCard';
import { Loader2 } from 'lucide-react';

type SortOption = 'newest' | 'oldest';

export function DecisionsTab() {
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterStatus, setFilterStatus] = useState<DecisionStatus | 'all'>('all');

  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['decisions'],
    queryFn: () => invoke<TeamDecision[]>('list_decisions'),
    refetchInterval: 30000,
  });

  const filteredAndSorted = useMemo(() => {
    let result = [...decisions];

    if (filterStatus !== 'all') {
      result = result.filter((d) => d.status === filterStatus);
    }

    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
    }

    return result;
  }, [decisions, sortBy, filterStatus]);

  // Count by status for filter display
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of decisions) {
      counts[d.status] = (counts[d.status] || 0) + 1;
    }
    return counts;
  }, [decisions]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="h-8 w-[90px] sm:w-[100px] text-xs flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as DecisionStatus | 'all')}
        >
          <SelectTrigger className="h-8 w-[110px] sm:w-[130px] text-xs flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({decisions.length})</SelectItem>
            {(Object.entries(DECISION_STATUS_LABELS) as [DecisionStatus, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label} ({statusCounts[value] || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Decision List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {decisions.length === 0
            ? 'No decisions recorded yet. Add a decision to track design choices.'
            : 'No decisions match your filters'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSorted.map((decision) => (
            <DecisionCard key={decision.id} decision={decision} />
          ))}
        </div>
      )}
    </div>
  );
}
