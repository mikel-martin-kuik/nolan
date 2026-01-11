import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import type { CronosHealthSummary } from '@/types';

interface TaskMonitoringDashboardProps {
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
}

export const TaskMonitoringDashboard: React.FC<TaskMonitoringDashboardProps> = ({
  refreshInterval = 10000,
}) => {
  const [health, setHealth] = useState<CronosHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await invoke<CronosHealthSummary>('get_cronos_health');
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchHealth, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchHealth, refreshInterval]);

  if (loading && !health) {
    return (
      <Card className="bg-secondary/10 border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Activity className="h-4 w-4 animate-pulse" />
            Loading metrics...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !health) {
    return (
      <Card className="bg-secondary/10 border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <XCircle className="h-4 w-4" />
            Failed to load metrics
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const successRate = Math.round(health.success_rate_7d * 100);

  return (
    <Card className="bg-secondary/10 border-border/30">
      <CardContent className="p-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Running agents */}
          <Tooltip content={`${health.running_agents} agent${health.running_agents !== 1 ? 's' : ''} currently executing`} side="bottom">
            <div className="flex items-center gap-1.5 cursor-default">
              <Activity className={`h-4 w-4 ${health.running_agents > 0 ? 'text-blue-500 animate-pulse' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">{health.running_agents}</span>
              <span className="text-xs text-muted-foreground">running</span>
            </div>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          {/* Health status */}
          <div className="flex items-center gap-2">
            <Tooltip content={`${health.healthy_agents} healthy agent${health.healthy_agents !== 1 ? 's' : ''}`} side="bottom">
              <div className="flex items-center gap-1 cursor-default">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-medium">{health.healthy_agents}</span>
              </div>
            </Tooltip>

            {health.warning_agents > 0 && (
              <Tooltip content={`${health.warning_agents} agent${health.warning_agents !== 1 ? 's' : ''} with warnings`} side="bottom">
                <div className="flex items-center gap-1 cursor-default">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-xs font-medium">{health.warning_agents}</span>
                </div>
              </Tooltip>
            )}

            {health.critical_agents > 0 && (
              <Tooltip content={`${health.critical_agents} critical agent${health.critical_agents !== 1 ? 's' : ''}`} side="bottom">
                <div className="flex items-center gap-1 cursor-default">
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-medium">{health.critical_agents}</span>
                </div>
              </Tooltip>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Success rate */}
          <Tooltip content="Success rate over the last 7 days" side="bottom">
            <div className="flex items-center gap-1.5 cursor-default">
              <TrendingUp className={`h-4 w-4 ${successRate >= 80 ? 'text-green-500' : successRate >= 50 ? 'text-yellow-500' : 'text-red-500'}`} />
              <span className="text-sm font-medium">{successRate}%</span>
              <span className="text-xs text-muted-foreground">7d</span>
            </div>
          </Tooltip>

          <div className="h-4 w-px bg-border" />

          {/* Recent runs summary */}
          <Tooltip content={`${health.recent_runs.length} runs tracked recently`} side="bottom">
            <div className="flex items-center gap-1.5 cursor-default">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{health.recent_runs.length}</span>
              <span className="text-xs text-muted-foreground">recent</span>
            </div>
          </Tooltip>

          {/* Totals badge */}
          <Badge variant="outline" className="text-[10px] ml-auto">
            {health.active_agents}/{health.total_agents} active
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
