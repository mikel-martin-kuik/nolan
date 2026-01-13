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
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStats, type DateRange } from '@/hooks/useAgentStats';

type TabType = 'overview' | 'sessions' | 'models';

interface AgentStatsPanelProps {
  agentName: string;
}

export const AgentStatsPanel: React.FC<AgentStatsPanelProps> = ({ agentName }) => {
  const {
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
  } = useAgentStats(agentName);

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sessionsPage, setSessionsPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Reset pagination when date range changes
  useEffect(() => {
    setSessionsPage(1);
  }, [selectedDateRange]);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'models', label: 'By Model' },
  ];

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const truncatePrompt = (prompt: string, maxLength: number = 60): string => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  // Paginated sessions
  const paginatedSessions = stats?.sessions.slice(
    (sessionsPage - 1) * ITEMS_PER_PAGE,
    sessionsPage * ITEMS_PER_PAGE
  ) || [];
  const totalSessionPages = stats ? Math.ceil(stats.sessions.length / ITEMS_PER_PAGE) : 0;

  return (
    <div className="h-full">
      <div className="w-full space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-lg font-semibold capitalize">{agentName} Stats</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex gap-1">
              {(['7d', '30d', 'all'] as const).map((range) => (
                <Button
                  key={range}
                  variant={selectedDateRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDateRange(range as DateRange)}
                  disabled={loading}
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  {range === 'all' ? 'All' : range === '7d' ? '7d' : '30d'}
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
          ) : stats ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <MessageSquare className="h-3 w-3" />
                    <span className="hidden sm:inline">Total </span>Sessions
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{stats.total_sessions}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3 w-3" />
                    <span className="hidden sm:inline">Total </span>Cost
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.total_cost)}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Clock className="h-3 w-3" />
                    Duration
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatDuration(stats.total_duration_secs)}</p>
                </Card>

                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Avg Cost
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.avg_cost_per_session)}</p>
                </Card>

                <Card className="p-3 sm:p-4 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Hash className="h-3 w-3" />
                    Tokens
                  </div>
                  <p className="text-lg sm:text-2xl font-bold">{formatTokens(stats.total_tokens)}</p>
                </Card>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all',
                      activeTab === tab.id
                        ? 'bg-foreground/10 text-foreground'
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">Models Used</h3>
                      <div className="space-y-3">
                        {stats.by_model.map((model) => (
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
                        {stats.by_model.length === 0 && (
                          <p className="text-sm text-muted-foreground">No model data available</p>
                        )}
                      </div>
                    </Card>

                    <Card className="p-6">
                      <h3 className="text-sm font-semibold mb-4">Recent Activity</h3>
                      <div className="space-y-3">
                        {stats.by_date.slice(0, 5).map((day) => (
                          <div key={day.date} className="flex items-center justify-between">
                            <span className="text-sm">{day.date}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-muted-foreground">
                                {formatTokens(day.total_tokens)} tokens
                              </span>
                              <span className="text-sm font-medium">
                                {formatCurrency(day.total_cost)}
                              </span>
                            </div>
                          </div>
                        ))}
                        {stats.by_date.length === 0 && (
                          <p className="text-sm text-muted-foreground">No activity data available</p>
                        )}
                      </div>
                    </Card>
                  </div>

                  {/* Recent Sessions Preview */}
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-4">Recent Sessions</h3>
                    <div className="space-y-3">
                      {stats.sessions.slice(0, 5).map((session) => (
                        <div key={session.session_id} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" title={session.original_prompt}>
                              {truncatePrompt(session.original_prompt, 80)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(session.start_time)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {getModelDisplayName(session.model)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(session.duration_secs)}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-medium whitespace-nowrap">
                            {formatCurrency(session.cost_usd)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {stats.sessions.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-4"
                        onClick={() => setActiveTab('sessions')}
                      >
                        View all {stats.sessions.length} sessions
                      </Button>
                    )}
                  </Card>
                </div>
              )}

              {activeTab === 'sessions' && (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">All Sessions ({stats.sessions.length})</h3>
                    {totalSessionPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                          disabled={sessionsPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {sessionsPage} / {totalSessionPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSessionsPage(p => Math.min(totalSessionPages, p + 1))}
                          disabled={sessionsPage === totalSessionPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Date</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Prompt</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Model</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Duration</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Tokens</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSessions.map((session) => (
                          <tr key={session.session_id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(session.start_time)}
                            </td>
                            <td className="py-2 px-2 max-w-[300px]">
                              <p className="truncate text-sm" title={session.original_prompt}>
                                {truncatePrompt(session.original_prompt, 50)}
                              </p>
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs">
                                {getModelDisplayName(session.model)}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                              {formatDuration(session.duration_secs)}
                            </td>
                            <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                              {formatTokens(session.total_tokens)}
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
                              {formatCurrency(session.cost_usd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
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
                          <span className="font-semibold">{formatCurrency(model.total_cost)}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs text-muted-foreground pl-2">
                          <div>
                            <span className="block">Input</span>
                            <span className="text-foreground">{formatTokens(model.input_tokens)}</span>
                          </div>
                          <div>
                            <span className="block">Output</span>
                            <span className="text-foreground">{formatTokens(model.output_tokens)}</span>
                          </div>
                          <div>
                            <span className="block">Cache Write</span>
                            <span className="text-foreground">{formatTokens(model.cache_creation_tokens)}</span>
                          </div>
                          <div>
                            <span className="block">Cache Read</span>
                            <span className="text-foreground">{formatTokens(model.cache_read_tokens)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {stats.by_model.length === 0 && (
                      <p className="text-sm text-muted-foreground">No model data available</p>
                    )}
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No stats available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentStatsPanel;
