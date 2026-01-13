import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@/lib/api';
import type { UsageStats, ProjectUsage } from '@/types/usage';

export type DateRange = 'all' | '7d' | '30d';

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export interface TimelineBar {
  date: Date;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
  heightPercent: number;
}

export interface TimelineChartData {
  maxCost: number;
  halfMaxCost: number;
  bars: TimelineBar[];
}

export interface UseUsageStatsResult {
  stats: UsageStats | null;
  sessionStats: ProjectUsage[] | null;
  loading: boolean;
  error: string | null;
  selectedDateRange: DateRange;
  timelineChartData: TimelineChartData | null;
  setSelectedDateRange: (range: DateRange) => void;
  loadUsageStats: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  formatNumber: (num: number) => string;
  formatTokens: (num: number) => string;
  getModelDisplayName: (model: string) => string;
}

/**
 * Hook for fetching and managing usage statistics.
 *
 * Handles data fetching with caching, date range filtering,
 * and provides formatting utilities for display.
 */
export function useUsageStats(): UseUsageStatsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [sessionStats, setSessionStats] = useState<ProjectUsage[] | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>('7d');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const hasLoadedRef = useRef(false);

  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }, []);

  const formatNumber = useCallback((num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  }, []);

  const formatTokens = useCallback((num: number): string => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return formatNumber(num);
  }, [formatNumber]);

  const getModelDisplayName = useCallback((model: string): string => {
    const modelMap: Record<string, string> = {
      'claude-opus-4-20250514': 'Opus 4',
      'claude-sonnet-4-20250514': 'Sonnet 4',
      'claude-4-opus': 'Opus 4',
      'claude-4-sonnet': 'Sonnet 4',
      'claude-3.5-sonnet': 'Sonnet 3.5',
      'claude-3-opus': 'Opus 3',
    };
    for (const [key, value] of Object.entries(modelMap)) {
      if (model.includes(key) || model.includes(key.replace('claude-', ''))) {
        return value;
      }
    }
    return model.replace('claude-', '').replace(/-\d+$/, '');
  }, []);

  const getCachedData = useCallback((key: string) => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: unknown) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const loadUsageStats = useCallback(async () => {
    const cacheKey = `usage-${selectedDateRange}`;

    const cachedStats = getCachedData(`${cacheKey}-stats`) as UsageStats | null;
    const cachedSessions = getCachedData(`${cacheKey}-sessions`) as ProjectUsage[] | null;

    if (cachedStats && cachedSessions) {
      setStats(cachedStats);
      setSessionStats(cachedSessions);
      setLoading(false);
      hasLoadedRef.current = true;
      return;
    }

    try {
      // Only show loading on initial load, not on refreshes
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      setError(null);

      let statsData: UsageStats;
      let sessionData: ProjectUsage[] = [];

      if (selectedDateRange === 'all') {
        // Fetch in parallel with individual error handling
        const [statsResult, sessionResult] = await Promise.all([
          invoke<UsageStats>('get_usage_stats').catch((err) => {
            console.error('Failed to fetch usage stats:', err);
            return null;
          }),
          invoke<ProjectUsage[]>('get_session_stats').catch((err) => {
            console.error('Failed to fetch session stats:', err);
            return [];
          })
        ]);
        if (!statsResult) throw new Error('Failed to load usage statistics');
        statsData = statsResult;
        sessionData = sessionResult;
      } else {
        const endDate = new Date();
        const startDate = new Date();
        const days = selectedDateRange === '7d' ? 7 : 30;
        startDate.setDate(startDate.getDate() - days);

        const formatDateForApi = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}${month}${day}`;
        };

        // Fetch in parallel with individual error handling
        const [statsResult, sessionResult] = await Promise.all([
          invoke<UsageStats>('get_usage_by_date_range', {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
          }).catch((err) => {
            console.error('Failed to fetch usage by date range:', err);
            return null;
          }),
          invoke<ProjectUsage[]>('get_session_stats', {
            since: formatDateForApi(startDate),
            until: formatDateForApi(endDate),
            order: 'desc'
          }).catch((err) => {
            console.error('Failed to fetch session stats:', err);
            return [];
          })
        ]);

        if (!statsResult) throw new Error('Failed to load usage statistics');
        statsData = statsResult;
        sessionData = sessionResult;
      }

      setStats(statsData);
      setSessionStats(sessionData);
      setCachedData(`${cacheKey}-stats`, statsData);
      setCachedData(`${cacheKey}-sessions`, sessionData);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load usage stats:', err);
      setError('Failed to load usage statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedDateRange, getCachedData, setCachedData]);

  const timelineChartData = useMemo((): TimelineChartData | null => {
    if (!stats?.by_date || stats.by_date.length === 0) return null;

    const maxCost = Math.max(...stats.by_date.map(d => d.total_cost), 0);
    const halfMaxCost = maxCost / 2;
    const reversedData = stats.by_date.slice().reverse();

    return {
      maxCost,
      halfMaxCost,
      bars: reversedData.map(day => ({
        ...day,
        heightPercent: maxCost > 0 ? (day.total_cost / maxCost) * 100 : 0,
        date: new Date(day.date.replace(/-/g, '/')),
      }))
    };
  }, [stats?.by_date]);

  useEffect(() => {
    loadUsageStats();
  }, [loadUsageStats]);

  return {
    stats,
    sessionStats,
    loading,
    error,
    selectedDateRange,
    timelineChartData,
    setSelectedDateRange,
    loadUsageStats,
    formatCurrency,
    formatNumber,
    formatTokens,
    getModelDisplayName,
  };
}
