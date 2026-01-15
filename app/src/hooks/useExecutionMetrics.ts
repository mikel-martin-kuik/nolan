import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MetricsDashboard,
  DailyMetrics,
  ExecutionMetrics,
  ProjectMetricsSummary,
  AgentPerformanceMetrics,
} from '@/types/metrics';

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
  selectedDateRange: MetricsDateRange;
  setSelectedDateRange: (range: MetricsDateRange) => void;
  refresh: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  formatDuration: (secs: number) => string;
  formatTokens: (num: number) => string;
  formatNumber: (num: number) => string;
}

/**
 * Generate mock execution metrics for demonstration.
 * In production, this would fetch from the backend API.
 */
function generateMockMetrics(days: number | undefined): MetricsDashboard {
  const now = new Date();
  const daysToGenerate = days || 90;
  const startDate = new Date(now.getTime() - daysToGenerate * 24 * 60 * 60 * 1000);

  // Generate daily metrics
  const dailyMetrics: DailyMetrics[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= now) {
    const executionCount = Math.floor(Math.random() * 10) + 1;
    const avgDuration = Math.floor(Math.random() * 300) + 60; // 1-6 minutes avg
    const avgTokens = Math.floor(Math.random() * 50000) + 10000;
    const avgCost = (avgTokens / 1000000) * 3; // Rough Sonnet pricing

    dailyMetrics.push({
      date: currentDate.toISOString().split('T')[0],
      execution_count: executionCount,
      total_duration_secs: avgDuration * executionCount,
      avg_duration_secs: avgDuration,
      total_tokens: avgTokens * executionCount,
      total_cost: avgCost * executionCount,
      avg_cost: avgCost,
      avg_agent_count: Math.floor(Math.random() * 3) + 2,
      avg_phase_count: Math.floor(Math.random() * 4) + 2,
      total_rejections: Math.floor(Math.random() * 3),
      total_retries: Math.floor(Math.random() * 2),
      avg_prompt_quality: Math.random() * 2 + 3, // 3-5 range
      avg_output_quality: Math.random() * 2 + 3, // 3-5 range
      quality_sample_count: Math.floor(executionCount * 0.3),
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Generate project summaries
  const projects = ['nolan', 'scheduler', 'agent-console', 'feedback-system'];
  const projectMetrics: ProjectMetricsSummary[] = projects.map(name => {
    const execCount = Math.floor(Math.random() * 50) + 10;
    const totalTokens = (Math.floor(Math.random() * 500000) + 100000);
    const totalCost = (totalTokens / 1000000) * 3;
    const totalDuration = Math.floor(Math.random() * 10000) + 2000;

    return {
      project_name: name,
      total_executions: execCount,
      total_tokens: totalTokens,
      total_cost: totalCost,
      total_duration_secs: totalDuration,
      avg_duration_secs: Math.floor(totalDuration / execCount),
      avg_cost: totalCost / execCount,
      avg_agents_per_execution: Math.floor(Math.random() * 2) + 2,
      avg_phases_per_execution: Math.floor(Math.random() * 3) + 2,
      first_execution_at: startDate.toISOString(),
      last_execution_at: now.toISOString(),
      avg_prompt_quality: Math.random() * 1.5 + 3.5,
      avg_output_quality: Math.random() * 1.5 + 3.5,
    };
  });

  // Generate agent performance metrics
  const agents = ['ana', 'bob', 'carlos', 'dan', 'enzo', 'ralph'];
  const agentMetrics: AgentPerformanceMetrics[] = agents.map(name => {
    const execCount = Math.floor(Math.random() * 100) + 20;
    const totalTokens = Math.floor(Math.random() * 1000000) + 200000;
    const totalCost = (totalTokens / 1000000) * 3;
    const totalDuration = Math.floor(Math.random() * 20000) + 5000;

    return {
      agent_name: name,
      execution_count: execCount,
      total_tokens: totalTokens,
      avg_tokens: Math.floor(totalTokens / execCount),
      total_cost: totalCost,
      avg_cost: totalCost / execCount,
      total_duration_secs: totalDuration,
      avg_duration_secs: Math.floor(totalDuration / execCount),
      rejection_count: Math.floor(Math.random() * 10),
      retry_count: Math.floor(Math.random() * 5),
    };
  });

  // Generate recent executions
  const recentExecutions: ExecutionMetrics[] = [];
  for (let i = 0; i < 10; i++) {
    const started = new Date(now.getTime() - i * 60 * 60 * 1000);
    const duration = Math.floor(Math.random() * 300) + 30;
    const tokens = Math.floor(Math.random() * 100000) + 10000;

    recentExecutions.push({
      execution_id: `exec-${Date.now()}-${i}`,
      project_name: projects[Math.floor(Math.random() * projects.length)],
      workflow_name: 'default-workflow',
      started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + duration * 1000).toISOString(),
      duration_secs: duration,
      total_tokens: tokens,
      input_tokens: Math.floor(tokens * 0.7),
      output_tokens: Math.floor(tokens * 0.2),
      cache_read_tokens: Math.floor(tokens * 0.08),
      cache_write_tokens: Math.floor(tokens * 0.02),
      agent_count: Math.floor(Math.random() * 3) + 2,
      phase_count: Math.floor(Math.random() * 4) + 2,
      rejection_count: Math.floor(Math.random() * 2),
      retry_count: Math.floor(Math.random() * 1),
      cost_usd: (tokens / 1000000) * 3,
      prompt_quality_score: Math.random() > 0.7 ? Math.random() * 2 + 3 : undefined,
      output_quality_score: Math.random() > 0.7 ? Math.random() * 2 + 3 : undefined,
    });
  }

  // Calculate totals
  const totalExecutions = dailyMetrics.reduce((sum, d) => sum + d.execution_count, 0);
  const totalTokens = dailyMetrics.reduce((sum, d) => sum + d.total_tokens, 0);
  const totalCost = dailyMetrics.reduce((sum, d) => sum + d.total_cost, 0);
  const totalDuration = dailyMetrics.reduce((sum, d) => sum + d.total_duration_secs, 0);

  return {
    total_executions: totalExecutions,
    total_tokens: totalTokens,
    total_cost: totalCost,
    total_duration_secs: totalDuration,
    avg_duration_secs: totalExecutions > 0 ? Math.floor(totalDuration / totalExecutions) : 0,
    avg_cost_per_execution: totalExecutions > 0 ? totalCost / totalExecutions : 0,
    daily_metrics: dailyMetrics.reverse(), // Most recent first
    by_project: projectMetrics.sort((a, b) => b.total_cost - a.total_cost),
    by_agent: agentMetrics.sort((a, b) => b.execution_count - a.execution_count),
    recent_executions: recentExecutions,
  };
}

/**
 * Hook for fetching execution metrics with trend data and breakdowns.
 */
export function useExecutionMetrics(): UseExecutionMetricsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MetricsDashboard | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<MetricsDateRange>('30d');

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

      const days = selectedDateRange === 'all' ? undefined :
                   selectedDateRange === '7d' ? 7 : 30;

      // TODO: Replace with actual API call when backend endpoint is available
      // const result = await invoke<MetricsDashboard>('get_execution_metrics', { days });

      // For now, generate mock data
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      const result = generateMockMetrics(days);

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
    selectedDateRange,
    setSelectedDateRange,
    refresh,
    formatCurrency,
    formatDuration,
    formatTokens,
    formatNumber,
  };
}
