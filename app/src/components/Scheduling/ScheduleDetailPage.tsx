import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { useCronOutputStore } from '@/store/cronOutputStore';
import { CronAgentOutputPanel } from '@/components/ScheduledAgents/CronAgentOutputPanel';
import type { ScheduledRunLog } from '@/types';
import type { ScheduleConfig } from './SchedulingPanel';

interface ScheduleDetailPageProps {
  schedule: ScheduleConfig;
  onBack: () => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export const ScheduleDetailPage: React.FC<ScheduleDetailPageProps> = ({
  schedule,
  onBack,
  onToggle,
}) => {
  const { selectedAgent, selectedRunId, openOutput, closeOutput } = useCronOutputStore();
  const [runHistory, setRunHistory] = useState<ScheduledRunLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRunHistory = useCallback(async () => {
    try {
      const history = await invoke<ScheduledRunLog[]>('get_scheduled_run_history', { limit: 100 });
      setRunHistory(history.filter(r => r.agent_name === schedule.agent_name));
    } catch {
      setRunHistory([]);
    } finally {
      setLoading(false);
    }
  }, [schedule.agent_name]);

  useEffect(() => {
    fetchRunHistory();
    // Poll for updates
    const interval = setInterval(fetchRunHistory, 5000);
    return () => {
      clearInterval(interval);
      closeOutput();
    };
  }, [fetchRunHistory, closeOutput]);

  const handleRunClick = (run: ScheduledRunLog) => {
    openOutput(schedule.agent_name, run.run_id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4 pb-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs h-7 px-2 w-fit">
          <ArrowLeft className="w-3 h-3 mr-1" />
          Back
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold">{schedule.name}</h1>
          <p className="text-xs text-muted-foreground">
            Agent: {schedule.agent_name} · {schedule.cron}
          </p>
        </div>

        <button
          onClick={() => onToggle(schedule.id, !schedule.enabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            schedule.enabled
              ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {schedule.enabled ? (
            <><Play className="w-3 h-3" />Active</>
          ) : (
            <><Pause className="w-3 h-3" />Paused</>
          )}
        </button>
      </div>

      {/* Content: Run History + Output Logs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-auto md:overflow-hidden">
        {/* Run History */}
        <Card className="flex flex-col h-full">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm">Run History</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">Loading...</p>
              </div>
            ) : (
              <ScrollArea className="h-full px-4 pb-4">
                {runHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No run history yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {runHistory.map((run) => {
                      const isFailed = run.status !== 'success' && run.status !== 'running';
                      const isSelected = selectedRunId === run.run_id;
                      return (
                        <Card
                          key={run.run_id}
                          className={`p-2 cursor-pointer hover:border-primary/50 transition-colors ${
                            isFailed ? 'border-red-500/50' : ''
                          } ${isSelected ? 'border-primary' : ''}`}
                          onClick={() => handleRunClick(run)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs">
                                {new Date(run.started_at).toLocaleString()}
                                {run.attempt > 1 && ` (attempt ${run.attempt})`}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {run.status}
                                  {run.trigger !== 'scheduled' && ` · ${run.trigger}`}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              {run.duration_secs !== undefined && run.duration_secs !== null && (
                                <span>{(run.duration_secs / 60).toFixed(1)}m</span>
                              )}
                              {run.total_cost_usd !== undefined && run.total_cost_usd !== null && (
                                <span className="ml-2">${run.total_cost_usd.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                          {run.error && (
                            <p className="text-xs text-destructive mt-1 truncate">{run.error}</p>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Output Logs */}
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm">Output Logs</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {selectedAgent === schedule.agent_name ? (
              <div className="h-full">
                <CronAgentOutputPanel embedded />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Select a run to view logs</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
