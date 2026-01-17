import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MetricsDashboard } from '@/types/metrics';

export type MetricsDateRange = 'all' | '7d' | '30d';

interface CacheEntry {
  data: MetricsDashboard;
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface UseExecutionMetricsResult {
  dashboard: MetricsDashboard | null;
  loading: boolean;
  error: string | null;
  /** Indicates that no backend endpoint exists yet for execution metrics */
  isNotImplemented: boolean;
  selectedDateRange: MetricsDateRange;
  setSelectedDateRange: (range: MetricsDateRange) => void;
  refresh: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  formatDuration: (secs: number) => string;
  formatTokens: (num: number) => string;
  formatNumber: (num: number) => string;
}

/**
 * Hook for fetching execution metrics with trend data and breakdowns.
 *
 * Fetches data from the get_execution_metrics Tauri command which scans
 * ~/.nolan/data/runs/ for run log files and aggregates them into metrics.
 */
export function useExecutionMetrics(): UseExecutionMetricsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MetricsDashboard | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<MetricsDateRange>('30d');
  // Backend endpoint is now implemented
  const [isNotImplemented] = useState(false);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

  const formatNumber = useCallback((num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  }, []);

  const getCachedData = useCallback((key: string): MetricsDashboard | null => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: MetricsDashboard) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const loadMetrics = useCallback(async () => {
    const cacheKey = `metrics-${selectedDateRange}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
      setDashboard(cached);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const days = selectedDateRange === 'all' ? null :
                   selectedDateRange === '7d' ? 7 : 30;
      const result = await invoke<MetricsDashboard>('get_execution_metrics', { days });
      setDashboard(result);
      setCachedData(cacheKey, result);
    } catch (err) {
      console.error('Failed to load execution metrics:', err);
      setError('Failed to load metrics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedDateRange, getCachedData, setCachedData]);

  const refresh = useCallback(async () => {
    cacheRef.current.clear();
    await loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return {
    dashboard,
    loading,
    error,
    isNotImplemented,
    selectedDateRange,
    setSelectedDateRange,
    refresh,
    formatCurrency,
    formatDuration,
    formatTokens,
    formatNumber,
  };
}
