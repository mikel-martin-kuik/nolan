import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToastStore } from '@/store/toastStore';
import { CRON_PRESETS, CRON_MODELS } from '@/types/cronos';
import type { CronAgentInfo, CronAgentConfig, CronRunLog } from '@/types';

interface CronAgentDetailPageProps {
  agentName: string;
  onBack: () => void;
  onTrigger: (name: string) => void;
  onDelete: (name: string) => void;
  onViewOutput: (runId: string) => void;
}

export const CronAgentDetailPage: React.FC<CronAgentDetailPageProps> = ({
  agentName,
  onBack,
  onTrigger: _onTrigger,
  onDelete: _onDelete,
  onViewOutput,
}) => {
  const [agent, setAgent] = useState<CronAgentInfo | null>(null);
  const [config, setConfig] = useState<CronAgentConfig | null>(null);
  const [runHistory, setRunHistory] = useState<CronRunLog[]>([]);
  const [instructionsContent, setInstructionsContent] = useState('');
  const [activeTab, setActiveTab] = useState('schedule');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasConfigChanges, setHasConfigChanges] = useState(false);
  const { error: showError, success: showSuccess } = useToastStore();

  const fetchAgent = useCallback(async () => {
    try {
      const agents = await invoke<CronAgentInfo[]>('list_cron_agents');
      setAgent(agents.find(a => a.name === agentName) || null);
    } catch (err) {
      showError(`Failed to load agent: ${err}`);
    }
  }, [agentName, showError]);

  const fetchConfig = useCallback(async () => {
    try {
      const cfg = await invoke<CronAgentConfig>('get_cron_agent', { name: agentName });
      setConfig(cfg);
    } catch (err) {
      showError(`Failed to load config: ${err}`);
    }
  }, [agentName, showError]);

  const fetchRunHistory = useCallback(async () => {
    try {
      const history = await invoke<CronRunLog[]>('get_cron_run_history', { limit: 100 });
      setRunHistory(history.filter(r => r.agent_name === agentName));
    } catch { /* ignore */ }
  }, [agentName]);

  const fetchInstructions = useCallback(async () => {
    try {
      const result = await invoke<string | { content: string }>('read_cron_agent_claude_md', { name: agentName });
      setInstructionsContent(typeof result === 'string' ? result : result?.content ?? '');
    } catch { /* ignore */ }
  }, [agentName]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchAgent(), fetchConfig(), fetchRunHistory(), fetchInstructions()]);
      setLoading(false);
    };
    load();
  }, [fetchAgent, fetchConfig, fetchRunHistory, fetchInstructions]);

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await invoke('update_cron_agent', { name: agentName, config });
      showSuccess('Configuration saved');
      setHasConfigChanges(false);
      fetchAgent();
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInstructions = async () => {
    setSaving(true);
    try {
      await invoke('write_cron_agent_claude_md', { name: agentName, content: instructionsContent });
      showSuccess('Instructions saved');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (updates: Partial<CronAgentConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
    setHasConfigChanges(true);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!agent || !config) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs h-7 px-2">Back</Button>

        <div className="ml-auto text-right">
          <h1 className="text-lg font-semibold">{agent.name}</h1>
          <p className="text-xs text-muted-foreground">
            {agent.enabled ? 'Active' : 'Inactive'} · {agent.stats.total_runs} runs · {(agent.stats.success_rate * 100).toFixed(0)}% success
            {agent.next_run && ` · Next: ${new Date(agent.next_run).toLocaleString()}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-6">
            {/* Config */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input className="mt-1" value={config.description} onChange={(e) => updateConfig({ description: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Schedule</label>
                  <Select value={config.schedule.cron} onValueChange={(v) => updateConfig({ schedule: { cron: v } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CRON_PRESETS.map((p) => <SelectItem key={p.cron} value={p.cron}>{p.label} ({p.cron})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Model</label>
                  <Select value={config.model} onValueChange={(v) => updateConfig({ model: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CRON_MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Timeout (seconds)</label>
                  <Input className="mt-1" type="number" value={config.timeout} onChange={(e) => updateConfig({ timeout: parseInt(e.target.value) || 300 })} />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch checked={config.enabled} onCheckedChange={(c) => updateConfig({ enabled: c })} />
                  <label className="text-sm font-medium">Enabled</label>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox checked={config.retry?.enabled || false} onCheckedChange={(c: boolean) => updateConfig({ retry: { ...config.retry, enabled: c } })} />
                    <label className="text-sm font-medium">Enable retries</label>
                  </div>
                  {config.retry?.enabled && (
                    <div className="grid grid-cols-2 gap-2 ml-6">
                      <div>
                        <label className="text-xs text-muted-foreground">Max Retries</label>
                        <Input type="number" className="h-8" value={config.retry?.max_retries || 3} onChange={(e) => updateConfig({ retry: { ...config.retry, max_retries: parseInt(e.target.value) || 3 } })} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Delay (sec)</label>
                        <Input type="number" className="h-8" value={config.retry?.delay_secs || 60} onChange={(e) => updateConfig({ retry: { ...config.retry, delay_secs: parseInt(e.target.value) || 60 } })} />
                      </div>
                    </div>
                  )}
                </div>
                <Button onClick={handleSaveConfig} disabled={saving || !hasConfigChanges} className="w-full">
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">Instructions (CLAUDE.md)</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <Textarea
                  className="flex-1 min-h-[300px] font-mono text-sm resize-none"
                  value={instructionsContent}
                  onChange={(e) => setInstructionsContent(e.target.value)}
                />
                <Button onClick={handleSaveInstructions} disabled={saving} className="w-full mt-3">
                  {saving ? 'Saving...' : 'Save Instructions'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {runHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>No run history yet</p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {runHistory.map((run) => {
                  const isFailed = run.status !== 'success' && run.status !== 'running';
                  return (
                    <Card
                      key={run.run_id}
                      className={`p-3 cursor-pointer hover:border-primary/50 transition-colors ${isFailed ? 'border-red-500/50' : ''}`}
                      onClick={() => onViewOutput(run.run_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">
                            {new Date(run.started_at).toLocaleString()}
                            {run.attempt > 1 && ` (attempt ${run.attempt})`}
                            <span className="text-muted-foreground ml-2">{run.status}</span>
                          </p>
                          {run.trigger !== 'scheduled' && (
                            <p className="text-xs text-muted-foreground capitalize">{run.trigger}</p>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {run.duration_secs !== undefined && <span>{run.duration_secs}s</span>}
                        </div>
                      </div>
                      {run.error && <p className="text-xs text-destructive mt-1 truncate">{run.error}</p>}
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="flex-1 overflow-auto">
          <div className="max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Health: {agent.health.status}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {agent.health.message && <p className="text-sm text-muted-foreground">{agent.health.message}</p>}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Success Rate</span>
                    <span className="text-sm font-medium">{(agent.stats.success_rate * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={agent.stats.success_rate * 100} className="h-2" />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t text-center">
                  <div>
                    <p className="text-2xl font-bold">{agent.stats.success_count}</p>
                    <p className="text-xs text-muted-foreground">Successful</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{agent.stats.failure_count}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{agent.stats.total_runs}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                {agent.stats.avg_duration_secs !== undefined && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">Average Duration</p>
                    <p className="text-lg font-medium">{agent.stats.avg_duration_secs.toFixed(1)}s</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
