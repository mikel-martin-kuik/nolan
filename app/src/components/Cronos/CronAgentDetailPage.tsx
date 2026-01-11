import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { useOllamaStore } from '@/store/ollamaStore';
import { useCronOutputStore } from '@/store/cronOutputStore';
import { Tooltip } from '@/components/ui/tooltip';
import { Sparkles, Loader2 } from 'lucide-react';
import { CRON_PRESETS, CRON_MODELS } from '@/types/cronos';
import { CronAgentOutputPanel } from './CronAgentOutputPanel';
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
  onViewOutput: _onViewOutput,
}) => {
  const { selectedAgent, selectedRunId, openOutput } = useCronOutputStore();
  const [agent, setAgent] = useState<CronAgentInfo | null>(null);
  const [config, setConfig] = useState<CronAgentConfig | null>(null);
  const [runHistory, setRunHistory] = useState<CronRunLog[]>([]);
  const [instructionsContent, setInstructionsContent] = useState('');
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasConfigChanges, setHasConfigChanges] = useState(false);
  const [generatingInstructions, setGeneratingInstructions] = useState(false);
  const { error: showError, success: showSuccess } = useToastStore();
  const { status: ollamaStatus, checkConnection, generate: ollamaGenerate } = useOllamaStore();

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

  // Check Ollama connection
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Generate instructions using Ollama
  const handleGenerateInstructions = async () => {
    if (!agentName) return;
    setGeneratingInstructions(true);
    try {
      const systemPrompt = `You are a DevOps specialist. Generate CLAUDE.md instructions for a scheduled automation agent. Focus on: task purpose, execution steps, success criteria, and error handling guidance. Use markdown formatting.`;
      const prompt = `Generate CLAUDE.md instructions for a cron agent named "${agentName}"${config?.description ? ` with description: "${config.description}"` : ''}${instructionsContent.trim() ? `\n\nCurrent instructions to improve:\n${instructionsContent}` : ''}`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      setInstructionsContent(result.trim());
    } catch (err) {
      showError(`Failed to generate: ${err}`);
    } finally {
      setGeneratingInstructions(false);
    }
  };

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

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg w-fit mb-4">
        <button
          onClick={() => setActiveTab('status')}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'status' && "bg-foreground/10 text-foreground",
            activeTab !== 'status' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Status</span>
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
            activeTab === 'schedule' && "bg-foreground/10 text-foreground",
            activeTab !== 'schedule' && "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>Config</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="h-full overflow-hidden">
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Config */}
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="text-base">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto space-y-4">
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
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Instructions (CLAUDE.md)</CardTitle>
                  {ollamaStatus === 'connected' && (
                    <Tooltip content="Generate instructions using local AI" side="top">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateInstructions}
                        disabled={generatingInstructions || saving}
                        className="gap-2"
                      >
                        {generatingInstructions ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Generate
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <Textarea
                  className="flex-1 font-mono text-sm resize-none"
                  value={instructionsContent}
                  onChange={(e) => setInstructionsContent(e.target.value)}
                  disabled={generatingInstructions}
                />
                <Button onClick={handleSaveInstructions} disabled={saving} className="w-full mt-3 flex-shrink-0">
                  {saving ? 'Saving...' : 'Save Instructions'}
                </Button>
              </CardContent>
            </Card>
          </div>
          </div>
        )}

        {/* Status Tab - Health on top, Run History + Logs side by side */}
        {activeTab === 'status' && (
          <div className="h-full overflow-hidden flex flex-col gap-4">
          {/* Health Summary - Compact horizontal layout */}
          <Card className="flex-shrink-0">
            <CardContent className="py-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Health:</span>
                  <span className="text-sm font-medium">{agent.health.status}</span>
                </div>
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <span className="text-sm text-muted-foreground">Success:</span>
                  <Progress value={agent.stats.success_rate * 100} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{(agent.stats.success_rate * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold">{agent.stats.success_count}</p>
                    <p className="text-[10px] text-muted-foreground">Success</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{agent.stats.failure_count}</p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{agent.stats.total_runs}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  {agent.stats.avg_duration_secs != null && (
                    <div>
                      <p className="text-lg font-bold">{agent.stats.avg_duration_secs.toFixed(1)}s</p>
                      <p className="text-[10px] text-muted-foreground">Avg Time</p>
                    </div>
                  )}
                </div>
              </div>
              {agent.health.message && <p className="text-xs text-muted-foreground mt-2">{agent.health.message}</p>}
            </CardContent>
          </Card>

          {/* Run History + Output Logs side by side */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {/* Run History */}
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="py-3 flex-shrink-0">
                <CardTitle className="text-sm">Run History</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
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
                            className={`p-2 cursor-pointer hover:border-primary/50 transition-colors ${isFailed ? 'border-red-500/50' : ''} ${isSelected ? 'border-primary' : ''}`}
                            onClick={() => openOutput(agentName, run.run_id)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs">
                                  {new Date(run.started_at).toLocaleString()}
                                  {run.attempt > 1 && ` (attempt ${run.attempt})`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {run.status}
                                  {run.trigger !== 'scheduled' && ` · ${run.trigger}`}
                                </p>
                              </div>
                              <div className="text-xs text-muted-foreground">
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
              </CardContent>
            </Card>

            {/* Output Logs */}
            <Card className="flex flex-col h-full overflow-hidden">
              <CardHeader className="py-3 flex-shrink-0">
                <CardTitle className="text-sm">Output Logs</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                {selectedAgent === agentName ? (
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
        )}
      </div>
    </div>
  );
};
