import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@/lib/api';
import type { AgentStats } from '@/types/usage';

export type DateRange = 'all' | '7d' | '30d';

interface CacheEntry {
  data: AgentStats;
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface UseAgentStatsResult {
  stats: AgentStats | null;
  loading: boolean;
  error: string | null;
  selectedDateRange: DateRange;
  setSelectedDateRange: (range: DateRange) => void;
  refresh: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  formatDuration: (secs: number) => string;
  formatTokens: (num: number) => string;
  getModelDisplayName: (model: string) => string;
}

/**
 * Hook for fetching agent-specific usage statistics.
 *
 * @param agentName - The agent name to fetch stats for (e.g., "ralph")
 */
export function useAgentStats(agentName: string): UseAgentStatsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>('30d');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }, []);

  const formatDuration = useCallback((secs: number): string => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
    }
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, []);

  const formatTokens = useCallback((num: number): string => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat('en-US').format(num);
  }, []);

  const getModelDisplayName = useCallback((model: string): string => {
    if (model.includes('opus')) return 'Opus';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('haiku')) return 'Haiku';
    return model.replace('claude-', '').replace(/-\d+.*$/, '');
  }, []);

  const getCachedData = useCallback((key: string): AgentStats | null => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: AgentStats) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const loadStats = useCallback(async () => {
    const cacheKey = `agent-${agentName}-${selectedDateRange}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
      setStats(cached);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const days = selectedDateRange === 'all' ? undefined :
                   selectedDateRange === '7d' ? 7 : 30;

      const result = await invoke<AgentStats>('get_agent_usage_stats', {
        agent_name: agentName,
        days
      });

      setStats(result);
      setCachedData(cacheKey, result);
    } catch (err) {
      console.error('Failed to load agent stats:', err);
      setError(`Failed to load stats for ${agentName}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [agentName, selectedDateRange, getCachedData, setCachedData]);

  const refresh = useCallback(async () => {
    // Clear cache and reload
    cacheRef.current.clear();
    await loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    loading,
    error,
    selectedDateRange,
    setSelectedDateRange,
    refresh,
    formatCurrency,
    formatDuration,
    formatTokens,
    getModelDisplayName,
  };
}
