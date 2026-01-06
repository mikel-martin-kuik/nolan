import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Calendar,
  Filter,
  Loader2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Zap,
  Hash,
  BarChart3,
  Info,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageStats, ProjectUsage } from '@/types/usage';

type TabType = 'overview' | 'models' | 'projects' | 'sessions' | 'timeline';
type DateRange = 'all' | '7d' | '30d';

// Cache for storing fetched data
const dataCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export const UsagePanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [sessionStats, setSessionStats] = useState<ProjectUsage[] | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>('7d');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Pagination states
  const [projectsPage, setProjectsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Pricing modal state
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Formatters
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
    // Check for partial matches
    for (const [key, value] of Object.entries(modelMap)) {
      if (model.includes(key) || model.includes(key.replace('claude-', ''))) {
        return value;
      }
    }
    // Simplify model name if not found
    return model.replace('claude-', '').replace(/-\d+$/, '');
  }, []);

  // Cache helpers
  const getCachedData = useCallback((key: string) => {
    const cached = dataCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: unknown) => {
    dataCache.set(key, { data, timestamp: Date.now() });
  }, []);

  const loadUsageStats = useCallback(async () => {
    const cacheKey = `usage-${selectedDateRange}`;

    const cachedStats = getCachedData(`${cacheKey}-stats`) as UsageStats | null;
    const cachedSessions = getCachedData(`${cacheKey}-sessions`) as ProjectUsage[] | null;

    if (cachedStats && cachedSessions) {
      setStats(cachedStats);
      setSessionStats(cachedSessions);
      setLoading(false);
      return;
    }

    try {
      if (!stats && !sessionStats) {
        setLoading(true);
      }
      setError(null);

      let statsData: UsageStats;
      let sessionData: ProjectUsage[] = [];

      if (selectedDateRange === 'all') {
        const [statsResult, sessionResult] = await Promise.all([
          invoke<UsageStats>('get_usage_stats'),
          invoke<ProjectUsage[]>('get_session_stats')
        ]);
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

        const [statsResult, sessionResult] = await Promise.all([
          invoke<UsageStats>('get_usage_by_date_range', {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }),
          invoke<ProjectUsage[]>('get_session_stats', {
            since: formatDateForApi(startDate),
            until: formatDateForApi(endDate),
            order: 'desc'
          })
        ]);

        statsData = statsResult;
        sessionData = sessionResult;
      }

      setStats(statsData);
      setSessionStats(sessionData);
      setCachedData(`${cacheKey}-stats`, statsData);
      setCachedData(`${cacheKey}-sessions`, sessionData);
    } catch (err) {
      console.error('Failed to load usage stats:', err);
      setError('Failed to load usage statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedDateRange, getCachedData, setCachedData, stats, sessionStats]);

  useEffect(() => {
    setProjectsPage(1);
    setSessionsPage(1);
    loadUsageStats();
  }, [loadUsageStats]);

  // Timeline chart data
  const timelineChartData = useMemo(() => {
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

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'models', label: 'By Model' },
    { id: 'projects', label: 'By Project' },
    { id: 'sessions', label: 'By Session' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="h-full">
      <div className="w-full space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
              <DollarSign className="w-6 h-6" />
              Usage Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track your Claude Code usage and costs
            </p>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {(['7d', '30d', 'all'] as const).map((range) => (
                <Button
                  key={range}
                  variant={selectedDateRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDateRange(range)}
                  disabled={loading}
                >
                  {range === 'all' ? 'All Time' : range === '7d' ? '7 Days' : '30 Days'}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/50 text-sm text-destructive">
              {error}
              <Button onClick={loadUsageStats} size="sm" className="ml-4">
                Try Again
              </Button>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3 w-3" />
                    Total Cost
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(stats.total_cost)}</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Zap className="h-3 w-3" />
                    Total Sessions
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(stats.total_sessions)}</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Hash className="h-3 w-3" />
                    Total Tokens
                  </div>
                  <p className="text-2xl font-bold">{formatTokens(stats.total_tokens)}</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Avg Cost/Session
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(stats.total_sessions > 0 ? stats.total_cost / stats.total_sessions : 0)}
                  </p>
                </Card>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-md transition-all',
                      activeTab === tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold">Token Breakdown</h3>
                      <button
                        onClick={() => setShowPricingModal(true)}
                        className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="View pricing"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Input</p>
                        <p className="text-lg font-semibold">{formatTokens(stats.total_input_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Output</p>
                        <p className="text-lg font-semibold">{formatTokens(stats.total_output_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">C/Write</p>
                        <p className="text-lg font-semibold">{formatTokens(stats.total_cache_creation_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">C/Read</p>
                        <p className="text-lg font-semibold">{formatTokens(stats.total_cache_read_tokens)}</p>
                      </div>
                    </div>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">Most Used Models</h3>
                      <div className="space-y-3">
                        {stats.by_model.slice(0, 3).map((model) => (
                          <div key={model.model} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {getModelDisplayName(model.model)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {model.session_count} sessions
                              </span>
                            </div>
                            <span className="text-sm font-medium">
                              {formatCurrency(model.total_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">Top Projects</h3>
                      <div className="space-y-3">
                        {stats.by_project.slice(0, 3).map((project) => (
                          <div key={project.project_path} className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium truncate max-w-[200px]" title={project.project_path}>
                                {project.project_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {project.session_count} sessions
                              </span>
                            </div>
                            <span className="text-sm font-medium">
                              {formatCurrency(project.total_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'models' && (
                <Card className="p-6">
                  <h3 className="text-sm font-semibold mb-4">Usage by Model</h3>
                  <div className="space-y-4">
                    {stats.by_model.map((model) => (
                      <div key={model.model} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs">
                              {getModelDisplayName(model.model)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {model.session_count} sessions
                            </span>
                          </div>
                          <span className="text-sm font-semibold">
                            {formatCurrency(model.total_cost)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Input: </span>
                            <span className="font-medium">{formatTokens(model.input_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Output: </span>
                            <span className="font-medium">{formatTokens(model.output_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cache W: </span>
                            <span className="font-medium">{formatTokens(model.cache_creation_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cache R: </span>
                            <span className="font-medium">{formatTokens(model.cache_read_tokens)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {activeTab === 'projects' && (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Usage by Project</h3>
                    <span className="text-xs text-muted-foreground">
                      {stats.by_project.length} total projects
                    </span>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const startIndex = (projectsPage - 1) * ITEMS_PER_PAGE;
                      const endIndex = startIndex + ITEMS_PER_PAGE;
                      const paginatedProjects = stats.by_project.slice(startIndex, endIndex);
                      const totalPages = Math.ceil(stats.by_project.length / ITEMS_PER_PAGE);

                      return (
                        <>
                          {paginatedProjects.map((project) => (
                            <div key={project.project_path} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                              <div className="flex flex-col truncate">
                                <span className="text-sm font-medium truncate" title={project.project_path}>
                                  {project.project_name}
                                </span>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    {project.session_count} sessions
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatTokens(project.total_tokens)} tokens
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">{formatCurrency(project.total_cost)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(project.total_cost / project.session_count)}/session
                                </p>
                              </div>
                            </div>
                          ))}

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4">
                              <span className="text-xs text-muted-foreground">
                                Showing {startIndex + 1}-{Math.min(endIndex, stats.by_project.length)} of {stats.by_project.length}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setProjectsPage(prev => Math.max(1, prev - 1))}
                                  disabled={projectsPage === 1}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm">
                                  Page {projectsPage} of {totalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setProjectsPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={projectsPage === totalPages}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </Card>
              )}

              {activeTab === 'sessions' && (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Usage by Session</h3>
                    {sessionStats && sessionStats.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {sessionStats.length} total sessions
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {sessionStats && sessionStats.length > 0 ? (() => {
                      const startIndex = (sessionsPage - 1) * ITEMS_PER_PAGE;
                      const endIndex = startIndex + ITEMS_PER_PAGE;
                      const paginatedSessions = sessionStats.slice(startIndex, endIndex);
                      const totalPages = Math.ceil(sessionStats.length / ITEMS_PER_PAGE);

                      return (
                        <>
                          {paginatedSessions.map((session, index) => (
                            <div key={`${session.project_path}-${session.project_name}-${startIndex + index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={session.project_path}>
                                    {session.project_path.split('/').slice(-2).join('/')}
                                  </span>
                                </div>
                                <span className="text-sm font-medium mt-1">
                                  {session.project_name}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">{formatCurrency(session.total_cost)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {session.last_used ? new Date(session.last_used).toLocaleDateString() : 'N/A'}
                                </p>
                              </div>
                            </div>
                          ))}

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4">
                              <span className="text-xs text-muted-foreground">
                                Showing {startIndex + 1}-{Math.min(endIndex, sessionStats.length)} of {sessionStats.length}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSessionsPage(prev => Math.max(1, prev - 1))}
                                  disabled={sessionsPage === 1}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm">
                                  Page {sessionsPage} of {totalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSessionsPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={sessionsPage === totalPages}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No session data available for the selected period
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {activeTab === 'timeline' && (
                <Card className="p-6">
                  <h3 className="text-sm font-semibold mb-6 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Daily Usage</span>
                  </h3>
                  {timelineChartData ? (
                    <div className="relative pl-12 pr-4">
                      {/* Y-axis labels */}
                      <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-muted-foreground w-10 text-right">
                        <span>{formatCurrency(timelineChartData.maxCost)}</span>
                        <span>{formatCurrency(timelineChartData.halfMaxCost)}</span>
                        <span>{formatCurrency(0)}</span>
                      </div>

                      {/* Chart container */}
                      <div className="flex items-end gap-1 h-64 border-l border-b border-border pl-4">
                        {timelineChartData.bars.map((day) => {
                          const formattedDate = day.date.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          });

                          return (
                            <div key={day.date.toISOString()} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                              {/* Tooltip */}
                              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 whitespace-nowrap">
                                  <p className="text-sm font-semibold">{formattedDate}</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Cost: {formatCurrency(day.total_cost)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTokens(day.total_tokens)} tokens
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {day.models_used.length} model{day.models_used.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>

                              {/* Bar */}
                              <div
                                className="w-full bg-primary hover:bg-primary/80 transition-colors rounded-t cursor-pointer min-h-[2px]"
                                style={{ height: `${Math.max(day.heightPercent, 1)}%` }}
                              />

                              {/* X-axis label */}
                              <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none">
                                {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* X-axis label */}
                      <div className="mt-10 text-center text-xs text-muted-foreground">
                        Daily Usage Over Time
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No usage data available for the selected period
                    </div>
                  )}
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Pricing Modal */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowPricingModal(false)}
          />
          <div className="relative bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Pricing ($/MTok)</h3>
              <button
                onClick={() => setShowPricingModal(false)}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium py-1">Model</th>
                  <th className="text-right font-medium py-1">Input</th>
                  <th className="text-right font-medium py-1">5m Cache</th>
                  <th className="text-right font-medium py-1">1h Cache</th>
                  <th className="text-right font-medium py-1 text-emerald-500">Cache Hit</th>
                  <th className="text-right font-medium py-1">Output</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr>
                  <td className="py-1">Opus 4.5</td>
                  <td className="text-right py-1">$5</td>
                  <td className="text-right py-1">$6.25</td>
                  <td className="text-right py-1">$10</td>
                  <td className="text-right py-1 text-emerald-500">$0.50</td>
                  <td className="text-right py-1">$25</td>
                </tr>
                <tr>
                  <td className="py-1">Sonnet 4.5</td>
                  <td className="text-right py-1">$3</td>
                  <td className="text-right py-1">$3.75</td>
                  <td className="text-right py-1">$6</td>
                  <td className="text-right py-1 text-emerald-500">$0.30</td>
                  <td className="text-right py-1">$15</td>
                </tr>
                <tr>
                  <td className="py-1">Haiku 4.5</td>
                  <td className="text-right py-1">$1</td>
                  <td className="text-right py-1">$1.25</td>
                  <td className="text-right py-1">$2</td>
                  <td className="text-right py-1 text-emerald-500">$0.10</td>
                  <td className="text-right py-1">$5</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-4">
              Cache writes are 1.25x (5m) or 2x (1h) base input. Cache hits are 0.1x base input.
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Prices as of January 2026. For current pricing, visit{' '}
              <a
                href="https://platform.claude.com/docs/en/about-claude/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                platform.claude.com
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
