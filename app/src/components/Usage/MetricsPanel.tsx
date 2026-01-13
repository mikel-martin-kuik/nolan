import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Filter,
  Loader2,
  DollarSign,
  Clock,
  Hash,
  BarChart3,
  TrendingUp,
  Users,
  FolderOpen,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Star,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionMetrics, type MetricsDateRange } from '@/hooks/useExecutionMetrics';

type TabType = 'overview' | 'trends' | 'projects' | 'agents' | 'quality';

export const MetricsPanel: React.FC = () => {
  const {
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
  } = useExecutionMetrics();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [projectsPage, setProjectsPage] = useState(1);
  const [agentsPage, setAgentsPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setProjectsPage(1);
    setAgentsPage(1);
  }, [selectedDateRange]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-3 w-3" /> },
    { id: 'trends', label: 'Trends', icon: <TrendingUp className="h-3 w-3" /> },
    { id: 'projects', label: 'Projects', icon: <FolderOpen className="h-3 w-3" /> },
    { id: 'agents', label: 'Agents', icon: <Users className="h-3 w-3" /> },
    { id: 'quality', label: 'Quality', icon: <Star className="h-3 w-3" /> },
  ];

  const formatQualityScore = (score: number | undefined): string => {
    if (score === undefined) return 'N/A';
    return score.toFixed(1);
  };

  const getQualityColor = (score: number | undefined): string => {
    if (score === undefined) return 'text-muted-foreground';
    if (score >= 4.5) return 'text-emerald-500';
    if (score >= 3.5) return 'text-yellow-500';
    return 'text-orange-500';
  };

  return (
    <div className="h-full">
      <div className="w-full space-y-4 sm:space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-lg font-semibold">Execution Metrics</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <div className="flex gap-1">
              {(['7d', '30d', 'all'] as const).map((range) => (
                <Button
                  key={range}
                  variant={selectedDateRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDateRange(range as MetricsDateRange)}
                  disabled={loading}
                  className="text-xs sm:text-sm"
                >
                  {range === 'all' ? 'All' : range}
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
              <Button onClick={refresh} size="sm" className="ml-4">
                Try Again
              </Button>
            </div>
          ) : dashboard ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Activity className="h-3 w-3" />
                    <span className="hidden sm:inline">Executions</span>
                    <span className="sm:hidden">Execs</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatNumber(dashboard.total_executions)}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3 w-3" />
                    Cost
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatCurrency(dashboard.total_cost)}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">Avg Duration</span>
                    <span className="sm:hidden">Duration</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatDuration(dashboard.avg_duration_secs)}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Hash className="h-3 w-3" />
                    Tokens
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatTokens(dashboard.total_tokens)}</p>
                </Card>

                <Card className="p-3 sm:p-4 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <BarChart3 className="h-3 w-3" />
                    <span className="hidden sm:inline">Avg/Exec</span>
                    <span className="sm:hidden">Avg Cost</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatCurrency(dashboard.avg_cost_per_execution)}</p>
                </Card>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-full sm:w-fit overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap flex-shrink-0',
                      activeTab === tab.id
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.label.slice(0, 4)}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Recent Executions */}
                  <Card className="p-3 sm:p-6">
                    <h3 className="text-sm font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Recent Executions
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {dashboard.recent_executions.slice(0, 5).map((exec) => (
                        <div
                          key={exec.execution_id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-border/50 last:border-0 gap-1"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate">{exec.project_name}</span>
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {new Date(exec.started_at).toLocaleDateString()}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {exec.agent_count} agents
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(exec.duration_secs)}
                              </span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-semibold">{formatCurrency(exec.cost_usd)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTokens(exec.total_tokens)} tokens
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {/* Top Projects */}
                    <Card className="p-3 sm:p-6">
                      <h3 className="text-sm font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Top Projects
                      </h3>
                      <div className="space-y-2 sm:space-y-3">
                        {dashboard.by_project.slice(0, 3).map((project) => (
                          <div key={project.project_name} className="flex items-center justify-between gap-2">
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">{project.project_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {project.total_executions} execs
                              </span>
                            </div>
                            <span className="text-sm font-semibold flex-shrink-0">
                              {formatCurrency(project.total_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Top Agents */}
                    <Card className="p-3 sm:p-6">
                      <h3 className="text-sm font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Most Active Agents
                      </h3>
                      <div className="space-y-2 sm:space-y-3">
                        {dashboard.by_agent.slice(0, 3).map((agent) => (
                          <div key={agent.agent_name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                                {agent.agent_name}
                              </Badge>
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                {agent.execution_count} execs
                              </span>
                            </div>
                            <span className="text-sm font-semibold flex-shrink-0">
                              {formatCurrency(agent.total_cost)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'trends' && (
                <Card className="p-3 sm:p-6">
                  <h3 className="text-sm font-semibold mb-4 sm:mb-6 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Daily Execution Trends
                  </h3>
                  {dashboard.daily_metrics.length > 0 ? (
                    <div className="space-y-4">
                      {/* Simple bar chart visualization */}
                      <div className="relative h-32 sm:h-48">
                        <div className="flex items-end gap-0.5 sm:gap-1 h-full">
                          {dashboard.daily_metrics.slice(0, 30).map((day) => {
                            const maxExecs = Math.max(...dashboard.daily_metrics.slice(0, 30).map(d => d.execution_count));
                            const height = maxExecs > 0 ? (day.execution_count / maxExecs) * 100 : 0;

                            return (
                              <div
                                key={day.date}
                                className="flex-1 h-full flex flex-col items-center justify-end group relative"
                              >
                                {/* Tooltip - hidden on mobile */}
                                <div className="hidden sm:block absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                                  <div className="bg-popover border border-border rounded-lg shadow-lg p-3 whitespace-nowrap">
                                    <p className="text-sm font-semibold">{day.date}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {day.execution_count} executions
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatCurrency(day.total_cost)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Avg: {formatDuration(day.avg_duration_secs)}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className="w-full bg-primary hover:bg-primary/80 transition-colors rounded-t cursor-pointer min-h-[2px]"
                                  style={{ height: `${Math.max(height, 2)}%` }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Trend Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 pt-3 sm:pt-4 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground">Executions</p>
                          <p className="text-base sm:text-lg font-semibold">
                            {formatNumber(dashboard.daily_metrics.slice(0, 30).reduce((sum, d) => sum + d.execution_count, 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cost</p>
                          <p className="text-base sm:text-lg font-semibold">
                            {formatCurrency(dashboard.daily_metrics.slice(0, 30).reduce((sum, d) => sum + d.total_cost, 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Rej/Day</p>
                          <p className="text-base sm:text-lg font-semibold">
                            {(dashboard.daily_metrics.slice(0, 30).reduce((sum, d) => sum + d.total_rejections, 0) / Math.min(30, dashboard.daily_metrics.length)).toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Retry/Day</p>
                          <p className="text-base sm:text-lg font-semibold">
                            {(dashboard.daily_metrics.slice(0, 30).reduce((sum, d) => sum + d.total_retries, 0) / Math.min(30, dashboard.daily_metrics.length)).toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No trend data available
                    </div>
                  )}
                </Card>
              )}

              {activeTab === 'projects' && (
                <Card className="p-3 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Project Metrics
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {dashboard.by_project.length} projects
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const startIndex = (projectsPage - 1) * ITEMS_PER_PAGE;
                      const endIndex = startIndex + ITEMS_PER_PAGE;
                      const paginated = dashboard.by_project.slice(startIndex, endIndex);
                      const totalPages = Math.ceil(dashboard.by_project.length / ITEMS_PER_PAGE);

                      return (
                        <>
                          {paginated.map((project) => (
                            <div
                              key={project.project_name}
                              className="flex items-center justify-between py-3 border-b border-border last:border-0"
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{project.project_name}</span>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>{project.total_executions} executions</span>
                                  <span>Avg: {formatDuration(project.avg_duration_secs)}</span>
                                  <span>{formatTokens(project.total_tokens)} tokens</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">{formatCurrency(project.total_cost)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(project.avg_cost)}/exec
                                </p>
                              </div>
                            </div>
                          ))}

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4">
                              <span className="text-xs text-muted-foreground">
                                Showing {startIndex + 1}-{Math.min(endIndex, dashboard.by_project.length)} of {dashboard.by_project.length}
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setProjectsPage((p) => Math.max(1, p - 1))}
                                  disabled={projectsPage === 1}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm">
                                  {projectsPage} / {totalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setProjectsPage((p) => Math.min(totalPages, p + 1))}
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

              {activeTab === 'agents' && (
                <Card className="p-3 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Agent Performance
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {dashboard.by_agent.length} agents
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Agent</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Executions</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Avg Duration</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Avg Tokens</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Rejections</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const startIndex = (agentsPage - 1) * ITEMS_PER_PAGE;
                          const endIndex = startIndex + ITEMS_PER_PAGE;
                          const paginated = dashboard.by_agent.slice(startIndex, endIndex);

                          return paginated.map((agent) => (
                            <tr key={agent.agent_name} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 px-2">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {agent.agent_name}
                                </Badge>
                              </td>
                              <td className="py-2 px-2 text-right">{formatNumber(agent.execution_count)}</td>
                              <td className="py-2 px-2 text-right text-muted-foreground">
                                {formatDuration(agent.avg_duration_secs)}
                              </td>
                              <td className="py-2 px-2 text-right text-muted-foreground">
                                {formatTokens(agent.avg_tokens)}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <span className={cn(
                                  agent.rejection_count > 5 ? 'text-orange-500' : 'text-muted-foreground'
                                )}>
                                  {agent.rejection_count}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right font-semibold">
                                {formatCurrency(agent.total_cost)}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {Math.ceil(dashboard.by_agent.length / ITEMS_PER_PAGE) > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <span className="text-xs text-muted-foreground">
                        Showing {(agentsPage - 1) * ITEMS_PER_PAGE + 1}-
                        {Math.min(agentsPage * ITEMS_PER_PAGE, dashboard.by_agent.length)} of {dashboard.by_agent.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAgentsPage((p) => Math.max(1, p - 1))}
                          disabled={agentsPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                          {agentsPage} / {Math.ceil(dashboard.by_agent.length / ITEMS_PER_PAGE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setAgentsPage((p) =>
                              Math.min(Math.ceil(dashboard.by_agent.length / ITEMS_PER_PAGE), p + 1)
                            )
                          }
                          disabled={agentsPage === Math.ceil(dashboard.by_agent.length / ITEMS_PER_PAGE)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {activeTab === 'quality' && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Quality Overview */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <Card className="p-3 sm:p-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                        <Star className="h-3 w-3" />
                        Avg Prompt Quality
                      </div>
                      {(() => {
                        const avgPrompt = dashboard.daily_metrics
                          .filter(d => d.avg_prompt_quality !== undefined)
                          .reduce((sum, d) => sum + (d.avg_prompt_quality || 0), 0) /
                          Math.max(1, dashboard.daily_metrics.filter(d => d.avg_prompt_quality !== undefined).length);
                        return (
                          <p className={cn('text-2xl sm:text-3xl font-bold', getQualityColor(avgPrompt || undefined))}>
                            {formatQualityScore(avgPrompt || undefined)}
                          </p>
                        );
                      })()}
                      <p className="text-xs text-muted-foreground mt-1">AI-evaluated score (1-5)</p>
                    </Card>

                    <Card className="p-3 sm:p-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                        <Star className="h-3 w-3" />
                        Avg Output Quality
                      </div>
                      {(() => {
                        const avgOutput = dashboard.daily_metrics
                          .filter(d => d.avg_output_quality !== undefined)
                          .reduce((sum, d) => sum + (d.avg_output_quality || 0), 0) /
                          Math.max(1, dashboard.daily_metrics.filter(d => d.avg_output_quality !== undefined).length);
                        return (
                          <p className={cn('text-2xl sm:text-3xl font-bold', getQualityColor(avgOutput || undefined))}>
                            {formatQualityScore(avgOutput || undefined)}
                          </p>
                        );
                      })()}
                      <p className="text-xs text-muted-foreground mt-1">AI-evaluated score (1-5)</p>
                    </Card>

                    <Card className="p-3 sm:p-6">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                        <Activity className="h-3 w-3" />
                        Sample Coverage
                      </div>
                      {(() => {
                        const totalSamples = dashboard.daily_metrics.reduce((sum, d) => sum + (d.quality_sample_count || 0), 0);
                        const totalExecs = dashboard.daily_metrics.reduce((sum, d) => sum + d.execution_count, 0);
                        const coverage = totalExecs > 0 ? (totalSamples / totalExecs) * 100 : 0;
                        return (
                          <>
                            <p className="text-2xl sm:text-3xl font-bold">{coverage.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatNumber(totalSamples)} of {formatNumber(totalExecs)} evaluated
                            </p>
                          </>
                        );
                      })()}
                    </Card>
                  </div>

                  {/* Quality by Project */}
                  <Card className="p-3 sm:p-6">
                    <h3 className="text-sm font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Quality by Project
                    </h3>
                    <div className="space-y-3">
                      {dashboard.by_project.map((project) => (
                        <div
                          key={project.project_name}
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                        >
                          <span className="text-sm font-medium">{project.project_name}</span>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Prompt</p>
                              <p className={cn('text-sm font-semibold', getQualityColor(project.avg_prompt_quality))}>
                                {formatQualityScore(project.avg_prompt_quality)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Output</p>
                              <p className={cn('text-sm font-semibold', getQualityColor(project.avg_output_quality))}>
                                {formatQualityScore(project.avg_output_quality)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Execution Issues */}
                  <Card className="p-3 sm:p-6">
                    <h3 className="text-sm font-semibold mb-3 sm:mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Execution Issues
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="text-xs sm:text-sm font-medium">Rejections</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {formatNumber(dashboard.daily_metrics.reduce((sum, d) => sum + d.total_rejections, 0))}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Avg {(dashboard.daily_metrics.reduce((sum, d) => sum + d.total_rejections, 0) /
                            Math.max(1, dashboard.total_executions)).toFixed(2)}/exec
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <RotateCcw className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs sm:text-sm font-medium">Retries</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {formatNumber(dashboard.daily_metrics.reduce((sum, d) => sum + d.total_retries, 0))}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Avg {(dashboard.daily_metrics.reduce((sum, d) => sum + d.total_retries, 0) /
                            Math.max(1, dashboard.total_executions)).toFixed(2)}/exec
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;
