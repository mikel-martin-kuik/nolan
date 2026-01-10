import React, { useState, useEffect, useCallback } from 'react';
import { invoke, isBrowserMode } from '@/lib/api';
import {
  Plus, RefreshCw, Play, Settings, Trash2, Code, Clock, History,
  Wrench, Square, Activity, AlertTriangle, CheckCircle, XCircle,
  Loader2, FileText, Zap, BarChart2
} from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  CronAgentInfo, CronAgentConfig, CronRunLog, CronRunStatus,
  CronOutputEvent, CronosHealthSummary, HealthStatus
} from '@/types';
import {
  CRON_PRESETS, CRON_MODELS, AGENT_TEMPLATES,
  createDefaultCronAgentConfig
} from '@/types/cronos';

function getStatusBadgeVariant(status: CronRunStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'success': return 'default';
    case 'failed': return 'destructive';
    case 'running': return 'secondary';
    case 'timeout': return 'destructive';
    case 'cancelled': return 'outline';
    case 'skipped': return 'outline';
    default: return 'outline';
  }
}

function getHealthBadgeVariant(status: HealthStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'healthy': return 'default';
    case 'warning': return 'secondary';
    case 'critical': return 'destructive';
    default: return 'outline';
  }
}

interface LogEntry {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
  tool_use_result?: {
    stdout?: string;
    stderr?: string;
  };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  model?: string;
  cwd?: string;
}

function parseLogToPlainText(content: unknown): string {
  if (typeof content !== 'string') {
    return '';
  }
  const lines = content.trim().split('\n');
  const output: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const entry: LogEntry = JSON.parse(line);

      switch (entry.type) {
        case 'system':
          if (entry.subtype === 'init') {
            output.push('--- Session Start ---');
            if (entry.model) output.push(`Model: ${entry.model}`);
            if (entry.cwd) output.push(`Working directory: ${entry.cwd}`);
            output.push('');
          }
          break;

        case 'assistant':
          if (entry.message?.content) {
            for (const block of entry.message.content) {
              if (block.type === 'text' && block.text) {
                output.push(`Assistant: ${block.text}`);
                output.push('');
              } else if (block.type === 'tool_use' && block.name) {
                const toolInput = block.input || {};
                let inputSummary = '';
                if ('command' in toolInput) {
                  inputSummary = ` -> ${toolInput.command}`;
                } else if ('description' in toolInput) {
                  inputSummary = ` -> ${toolInput.description}`;
                } else if ('pattern' in toolInput) {
                  inputSummary = ` -> ${toolInput.pattern}`;
                }
                output.push(`Tool: ${block.name}${inputSummary}`);
              }
            }
          }
          break;

        case 'user':
          if (entry.tool_use_result) {
            const { stdout, stderr } = entry.tool_use_result;
            if (stdout) {
              output.push('Output:');
              output.push(stdout.split('\n').map(l => `   ${l}`).join('\n'));
              output.push('');
            }
            if (stderr) {
              output.push('Stderr:');
              output.push(stderr.split('\n').map(l => `   ${l}`).join('\n'));
              output.push('');
            }
          }
          break;

        case 'result':
          output.push('--- Result ---');
          if (entry.result) {
            output.push(entry.result);
          }
          if (entry.duration_ms) {
            output.push(`\nDuration: ${(entry.duration_ms / 1000).toFixed(2)}s`);
          }
          if (entry.total_cost_usd) {
            output.push(`Cost: $${entry.total_cost_usd.toFixed(4)}`);
          }
          break;
      }
    } catch {
      output.push(line);
    }
  }

  return output.join('\n');
}

export const CronosPanel: React.FC = () => {
  const [agents, setAgents] = useState<CronAgentInfo[]>([]);
  const [runHistory, setRunHistory] = useState<CronRunLog[]>([]);
  const [healthSummary, setHealthSummary] = useState<CronosHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('factory');

  // Real-time output state
  const [liveOutput, setLiveOutput] = useState<CronOutputEvent[]>([]);
  const [showLiveOutput, setShowLiveOutput] = useState<string | null>(null);

  // Dialog states
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [editorAgent, setEditorAgent] = useState<CronAgentConfig | null>(null);
  const [instructionsAgent, setInstructionsAgent] = useState<string | null>(null);
  const [instructionsContent, setInstructionsContent] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [logViewer, setLogViewer] = useState<{ runId: string; content: string } | null>(null);

  // Form state for creator
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentConfig, setNewAgentConfig] = useState<CronAgentConfig | null>(null);

  const { error: showError, success: showSuccess } = useToastStore();

  // Subscribe to real-time output events (Tauri only)
  useEffect(() => {
    if (isBrowserMode()) {
      // In browser mode, real-time streaming is not available
      return;
    }

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsubscribe = await listen<CronOutputEvent>('cronos:output', (event) => {
          setLiveOutput(prev => [...prev.slice(-500), event.payload]);
        });
        cleanup = unsubscribe;
      } catch (err) {
        console.warn('[CronosPanel] Failed to setup event listener:', err);
      }
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  // Browser mode: Poll for agent status and auto-refresh when running
  useEffect(() => {
    if (!showLiveOutput) return;

    // Poll for updates while live output is shown
    const pollInterval = setInterval(async () => {
      try {
        const updatedAgents = await invoke<CronAgentInfo[]>('list_cron_agents');
        const agent = updatedAgents.find(a => a.name === showLiveOutput);

        if (agent) {
          // Update agents list
          setAgents(updatedAgents);

          // If agent finished running, fetch the log and show it
          if (!agent.is_running && agent.last_run) {
            try {
              const logContent = await invoke<string>('get_cron_run_log', { runId: agent.last_run.run_id });
              // Parse and add to live output
              const lines = logContent.split('\n').filter(Boolean);
              const events: CronOutputEvent[] = lines.map((line) => ({
                run_id: agent.last_run!.run_id,
                agent_name: showLiveOutput,
                event_type: 'stdout' as const,
                content: line,
                timestamp: new Date().toISOString(),
              }));
              setLiveOutput(events);
            } catch {
              // Log might not be ready yet
            }
          }
        }
      } catch (err) {
        console.warn('[CronosPanel] Poll error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [showLiveOutput]);

  // Fetch agents list
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<CronAgentInfo[]>('list_cron_agents');
      setAgents(list);
    } catch (err) {
      showError(`Failed to load cron agents: ${err}`);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Fetch run history
  const fetchRunHistory = useCallback(async () => {
    try {
      const history = await invoke<CronRunLog[]>('get_cron_run_history', { limit: 50 });
      setRunHistory(history);
    } catch (err) {
      console.error('Failed to load run history:', err);
    }
  }, []);

  // Fetch health summary
  const fetchHealth = useCallback(async () => {
    try {
      const health = await invoke<CronosHealthSummary>('get_cronos_health');
      setHealthSummary(health);
    } catch (err) {
      console.error('Failed to load health summary:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents();
    fetchRunHistory();
    fetchHealth();
  }, [fetchAgents, fetchRunHistory, fetchHealth]);

  // Refresh on tab change
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchRunHistory();
    } else if (activeTab === 'health') {
      fetchHealth();
    }
  }, [activeTab, fetchRunHistory, fetchHealth]);

  // Auto-refresh agents when there are running agents
  useEffect(() => {
    const hasRunning = agents.some(a => a.is_running);
    if (hasRunning) {
      const interval = setInterval(fetchAgents, 3000);
      return () => clearInterval(interval);
    }
  }, [agents, fetchAgents]);

  // Handle agent creation
  const handleCreate = useCallback(async () => {
    if (!newAgentName.trim()) {
      showError('Agent name is required');
      return;
    }

    const name = newAgentName.startsWith('cron-') ? newAgentName : `cron-${newAgentName}`;
    const config = newAgentConfig || createDefaultCronAgentConfig(name);
    config.name = name;

    try {
      await invoke('create_cron_agent', { config });
      showSuccess(`Created cron agent: ${name}`);
      setCreatorOpen(false);
      setNewAgentName('');
      setNewAgentConfig(null);
      fetchAgents();
    } catch (err) {
      showError(`Failed to create agent: ${err}`);
    }
  }, [newAgentName, newAgentConfig, showError, showSuccess, fetchAgents]);

  // Handle agent update
  const handleUpdate = useCallback(async () => {
    if (!editorAgent) return;

    try {
      await invoke('update_cron_agent', {
        name: editorAgent.name,
        config: editorAgent
      });
      showSuccess(`Updated ${editorAgent.name}`);
      setEditorAgent(null);
      fetchAgents();
    } catch (err) {
      showError(`Failed to update agent: ${err}`);
    }
  }, [editorAgent, showError, showSuccess, fetchAgents]);

  // Handle toggle enabled
  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    try {
      await invoke('toggle_cron_agent', { name, enabled });
      showSuccess(`${name} ${enabled ? 'enabled' : 'disabled'}`);
      fetchAgents();
    } catch (err) {
      showError(`Failed to toggle agent: ${err}`);
    }
  }, [showError, showSuccess, fetchAgents]);

  // Handle agent delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      await invoke('delete_cron_agent', { name: deleteConfirm });
      showSuccess(`Deleted ${deleteConfirm}`);
      setDeleteConfirm(null);
      fetchAgents();
    } catch (err) {
      showError(`Failed to delete agent: ${err}`);
    }
  }, [deleteConfirm, showError, showSuccess, fetchAgents]);

  // Handle trigger run
  const handleTrigger = useCallback(async (name: string) => {
    try {
      await invoke('trigger_cron_agent', { name });
      showSuccess(`Triggered ${name}`);
      setLiveOutput([]);
      setShowLiveOutput(name);
      fetchAgents();
    } catch (err) {
      showError(`Failed to trigger agent: ${err}`);
    }
  }, [showError, showSuccess, fetchAgents]);

  // Handle cancel run
  const handleCancel = useCallback(async (name: string) => {
    try {
      await invoke('cancel_cron_agent', { name });
      showSuccess(`Cancelled ${name}`);
      fetchAgents();
      fetchRunHistory();
    } catch (err) {
      showError(`Failed to cancel agent: ${err}`);
    }
  }, [showError, showSuccess, fetchAgents, fetchRunHistory]);

  // Handle edit instructions (CLAUDE.md)
  const handleEditInstructions = useCallback(async (name: string) => {
    try {
      const result = await invoke<string | { content: string }>('read_cron_agent_claude_md', { name });
      const content = typeof result === 'string' ? result : result?.content ?? '';
      setInstructionsContent(content);
      setInstructionsAgent(name);
    } catch (err) {
      showError(`Failed to load instructions: ${err}`);
    }
  }, [showError]);

  // Handle save instructions
  const handleSaveInstructions = useCallback(async () => {
    if (!instructionsAgent) return;

    try {
      await invoke('write_cron_agent_claude_md', {
        name: instructionsAgent,
        content: instructionsContent
      });
      showSuccess('Instructions saved');
      setInstructionsAgent(null);
    } catch (err) {
      showError(`Failed to save instructions: ${err}`);
    }
  }, [instructionsAgent, instructionsContent, showError, showSuccess]);

  // Handle view log
  const handleViewLog = useCallback(async (runId: string) => {
    try {
      const content = await invoke<string>('get_cron_run_log', { runId });
      setLogViewer({ runId, content });
    } catch (err) {
      showError(`Failed to load log: ${err}`);
    }
  }, [showError]);

  // Load agent for editing
  const loadAgentForEdit = useCallback(async (name: string) => {
    try {
      const config = await invoke<CronAgentConfig>('get_cron_agent', { name });
      setEditorAgent(config);
    } catch (err) {
      showError(`Failed to load agent config: ${err}`);
    }
  }, [showError]);

  // Handle template selection
  const handleSelectTemplate = useCallback((templateId: string) => {
    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      const config = createDefaultCronAgentConfig(`cron-${templateId}`);
      Object.assign(config, template.config);
      setNewAgentConfig(config);
      setNewAgentName(templateId);
      setTemplateSelectorOpen(false);
      setCreatorOpen(true);
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-6 h-6" />
            Cronos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scheduled automation agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { fetchAgents(); fetchHealth(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={() => setTemplateSelectorOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button onClick={() => setCreatorOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Health Summary Bar */}
      {healthSummary && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Agents</span>
              <span className="text-lg font-semibold">{healthSummary.total_agents}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active</span>
              <span className="text-lg font-semibold text-green-500">{healthSummary.active_agents}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Running</span>
              <span className="text-lg font-semibold text-blue-500">{healthSummary.running_agents}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Success Rate (7d)</span>
              <span className="text-lg font-semibold">{(healthSummary.success_rate_7d * 100).toFixed(0)}%</span>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="factory" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Factory
          </TabsTrigger>
          <TabsTrigger value="scheduler" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Scheduler
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Health
          </TabsTrigger>
        </TabsList>

        {/* Factory View - Agent Cards Grid */}
        <TabsContent value="factory" className="flex-1 overflow-auto">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Clock className="w-12 h-12 mb-4 opacity-50" />
              <p>No cron agents configured</p>
              <p className="text-sm">Create your first scheduled agent</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card key={agent.name} className={`group hover:border-primary/50 transition-colors ${agent.is_running ? 'border-blue-500' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {agent.name}
                          {agent.is_running && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </CardTitle>
                        <CardDescription className="mt-1">{agent.description || 'No description'}</CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge variant={agent.enabled ? 'default' : 'secondary'}>
                          {agent.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant={getHealthBadgeVariant(agent.health.status)} className="text-xs">
                          {agent.health.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Schedule:</span>
                        <span className="font-mono">{agent.schedule}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Model:</span>
                        <span>{agent.model}</span>
                      </div>
                      {agent.stats.total_runs > 0 && (
                        <div className="flex items-center justify-between">
                          <span>Success rate:</span>
                          <span>{(agent.stats.success_rate * 100).toFixed(0)}% ({agent.stats.total_runs} runs)</span>
                        </div>
                      )}
                      {agent.next_run && !agent.is_running && (
                        <div className="flex items-center justify-between">
                          <span>Next run:</span>
                          <span>{new Date(agent.next_run).toLocaleString()}</span>
                        </div>
                      )}
                      {agent.last_run && (
                        <div className="flex items-center justify-between">
                          <span>Last run:</span>
                          <Badge variant={getStatusBadgeVariant(agent.last_run.status)}>
                            {agent.last_run.status}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border">
                      {agent.is_running ? (
                        <Button variant="ghost" size="icon" onClick={() => handleCancel(agent.name)} title="Cancel run">
                          <Square className="w-4 h-4 text-red-500" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleTrigger(agent.name)} title="Run now">
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEditInstructions(agent.name)} title="Edit instructions">
                        <Code className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => loadAgentForEdit(agent.name)} title="Settings">
                        <Settings className="w-4 h-4" />
                      </Button>
                      {agent.is_running && (
                        <Button variant="ghost" size="icon" onClick={() => setShowLiveOutput(agent.name)} title="View output">
                          <Zap className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                      <div className="flex-1" />
                      <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(agent.name)} title="Delete" disabled={agent.is_running}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Scheduler View - Enable/Disable and Run Now */}
        <TabsContent value="scheduler" className="flex-1 overflow-auto">
          <div className="space-y-2">
            {agents.map((agent) => (
              <Card key={agent.name} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={agent.enabled}
                      onCheckedChange={(checked) => handleToggle(agent.name, checked)}
                    />
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {agent.name}
                        {agent.is_running && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      </p>
                      <p className="text-sm text-muted-foreground">{agent.schedule}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agent.next_run && !agent.is_running && (
                      <span className="text-sm text-muted-foreground">
                        Next: {new Date(agent.next_run).toLocaleString()}
                      </span>
                    )}
                    {agent.is_running ? (
                      <Button variant="outline" size="sm" onClick={() => handleCancel(agent.name)}>
                        <Square className="w-4 h-4 mr-1" />
                        Stop
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleTrigger(agent.name)}>
                        <Play className="w-4 h-4 mr-1" />
                        Run Now
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Audit Log View - Run History */}
        <TabsContent value="audit" className="flex-1 overflow-auto">
          <div className="space-y-2">
            {runHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <History className="w-12 h-12 mb-4 opacity-50" />
                <p>No run history yet</p>
              </div>
            ) : (
              runHistory.map((run) => (
                <Card
                  key={run.run_id}
                  className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleViewLog(run.run_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge variant={getStatusBadgeVariant(run.status)}>
                        {run.status}
                      </Badge>
                      <div>
                        <p className="font-medium">{run.agent_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(run.started_at).toLocaleString()}
                          {run.attempt > 1 && ` (attempt ${run.attempt})`}
                          {run.trigger !== 'scheduled' && ` - ${run.trigger}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {run.duration_secs !== undefined && (
                        <span>{run.duration_secs}s</span>
                      )}
                    </div>
                  </div>
                  {run.error && (
                    <p className="text-sm text-destructive mt-2">{run.error}</p>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Health Dashboard */}
        <TabsContent value="health" className="flex-1 overflow-auto">
          {healthSummary ? (
            <div className="space-y-6">
              {/* Health Overview */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{healthSummary.healthy_agents}</p>
                      <p className="text-sm text-muted-foreground">Healthy</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold">{healthSummary.warning_agents}</p>
                      <p className="text-sm text-muted-foreground">Warning</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-8 h-8 text-red-500" />
                    <div>
                      <p className="text-2xl font-bold">{healthSummary.critical_agents}</p>
                      <p className="text-sm text-muted-foreground">Critical</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Agent Health List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart2 className="w-5 h-5" />
                    Agent Health Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agents.map((agent) => (
                      <div key={agent.name} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          {agent.health.status === 'healthy' && <CheckCircle className="w-5 h-5 text-green-500" />}
                          {agent.health.status === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                          {agent.health.status === 'critical' && <XCircle className="w-5 h-5 text-red-500" />}
                          {agent.health.status === 'unknown' && <Activity className="w-5 h-5 text-gray-400" />}
                          <div>
                            <p className="font-medium">{agent.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {agent.health.message || `${agent.stats.total_runs} runs, ${(agent.stats.success_rate * 100).toFixed(0)}% success`}
                            </p>
                          </div>
                        </div>
                        {agent.stats.total_runs > 0 && (
                          <div className="w-32">
                            <Progress value={agent.stats.success_rate * 100} className="h-2" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Template Selector Dialog */}
      <Dialog open={templateSelectorOpen} onOpenChange={setTemplateSelectorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Templates</DialogTitle>
            <DialogDescription>
              Choose a template to quickly create a new agent
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {AGENT_TEMPLATES.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleSelectTemplate(template.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Agent Dialog */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Cron Agent</DialogTitle>
            <DialogDescription>
              Create a new scheduled automation agent
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">Name</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground">cron-</span>
                <Input
                  id="name"
                  placeholder="task-name"
                  value={newAgentName.replace(/^cron-/, '')}
                  onChange={(e) => setNewAgentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>
            <div>
              <label htmlFor="description" className="text-sm font-medium">Description</label>
              <Input
                id="description"
                className="mt-1"
                placeholder="What does this agent do?"
                value={newAgentConfig?.description || ''}
                onChange={(e) => setNewAgentConfig({
                  ...createDefaultCronAgentConfig(`cron-${newAgentName}`),
                  ...newAgentConfig,
                  description: e.target.value
                })}
              />
            </div>
            <div>
              <label htmlFor="schedule" className="text-sm font-medium">Schedule</label>
              <Select
                value={newAgentConfig?.schedule.cron || '0 9 * * 1'}
                onValueChange={(value) => setNewAgentConfig({
                  ...createDefaultCronAgentConfig(`cron-${newAgentName}`),
                  ...newAgentConfig,
                  schedule: { cron: value }
                })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((preset) => (
                    <SelectItem key={preset.cron} value={preset.cron}>
                      {preset.label} ({preset.cron})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="model" className="text-sm font-medium">Model</label>
              <Select
                value={newAgentConfig?.model || 'sonnet'}
                onValueChange={(value) => setNewAgentConfig({
                  ...createDefaultCronAgentConfig(`cron-${newAgentName}`),
                  ...newAgentConfig,
                  model: value
                })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label} - {model.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatorOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editorAgent} onOpenChange={(open) => !open && setEditorAgent(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editorAgent?.name}</DialogTitle>
            <DialogDescription>
              Configure agent settings
            </DialogDescription>
          </DialogHeader>
          {editorAgent && (
            <div className="space-y-4">
              <div>
                <label htmlFor="edit-description" className="text-sm font-medium">Description</label>
                <Input
                  id="edit-description"
                  className="mt-1"
                  value={editorAgent.description}
                  onChange={(e) => setEditorAgent({ ...editorAgent, description: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="edit-schedule" className="text-sm font-medium">Schedule</label>
                <Select
                  value={editorAgent.schedule.cron}
                  onValueChange={(value) => setEditorAgent({
                    ...editorAgent,
                    schedule: { ...editorAgent.schedule, cron: value }
                  })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((preset) => (
                      <SelectItem key={preset.cron} value={preset.cron}>
                        {preset.label} ({preset.cron})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="edit-model" className="text-sm font-medium">Model</label>
                <Select
                  value={editorAgent.model}
                  onValueChange={(value) => setEditorAgent({ ...editorAgent, model: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label} - {model.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="edit-timeout" className="text-sm font-medium">Timeout (seconds)</label>
                <Input
                  id="edit-timeout"
                  className="mt-1"
                  type="number"
                  value={editorAgent.timeout}
                  onChange={(e) => setEditorAgent({
                    ...editorAgent,
                    timeout: parseInt(e.target.value) || 300
                  })}
                />
              </div>

              {/* Concurrency Settings */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Concurrency</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow-parallel"
                    checked={editorAgent.concurrency?.allow_parallel || false}
                    onCheckedChange={(checked: boolean) => setEditorAgent({
                      ...editorAgent,
                      concurrency: { ...editorAgent.concurrency, allow_parallel: checked }
                    })}
                  />
                  <label htmlFor="allow-parallel" className="text-sm">Allow parallel runs</label>
                </div>
              </div>

              {/* Retry Settings */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Retry Policy</p>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="retry-enabled"
                    checked={editorAgent.retry?.enabled || false}
                    onCheckedChange={(checked: boolean) => setEditorAgent({
                      ...editorAgent,
                      retry: { ...editorAgent.retry, enabled: checked }
                    })}
                  />
                  <label htmlFor="retry-enabled" className="text-sm">Enable retries</label>
                </div>
                {editorAgent.retry?.enabled && (
                  <div className="grid grid-cols-2 gap-2 ml-6">
                    <div>
                      <label className="text-xs text-muted-foreground">Max Retries</label>
                      <Input
                        type="number"
                        className="h-8"
                        value={editorAgent.retry?.max_retries || 3}
                        onChange={(e) => setEditorAgent({
                          ...editorAgent,
                          retry: { ...editorAgent.retry, max_retries: parseInt(e.target.value) || 3 }
                        })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Delay (sec)</label>
                      <Input
                        type="number"
                        className="h-8"
                        value={editorAgent.retry?.delay_secs || 60}
                        onChange={(e) => setEditorAgent({
                          ...editorAgent,
                          retry: { ...editorAgent.retry, delay_secs: parseInt(e.target.value) || 60 }
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 border-t pt-4">
                <Checkbox
                  id="edit-enabled"
                  checked={editorAgent.enabled}
                  onCheckedChange={(checked: boolean) => setEditorAgent({ ...editorAgent, enabled: checked })}
                />
                <label htmlFor="edit-enabled" className="text-sm font-medium">Enabled</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorAgent(null)}>Cancel</Button>
            <Button onClick={handleUpdate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions Editor Dialog */}
      <Dialog open={!!instructionsAgent} onOpenChange={(open) => !open && setInstructionsAgent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Instructions - {instructionsAgent}</DialogTitle>
            <DialogDescription>
              Edit the CLAUDE.md file that defines this agent's behavior
            </DialogDescription>
          </DialogHeader>
          <div className="h-[400px] border rounded-md overflow-auto">
            <Textarea
              className="min-h-[400px] font-mono text-sm border-0 focus-visible:ring-0 resize-none"
              value={instructionsContent}
              onChange={(e) => setInstructionsContent(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstructionsAgent(null)}>Cancel</Button>
            <Button onClick={handleSaveInstructions}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the agent and all its configuration.
              Run history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Log Viewer Dialog */}
      <Dialog open={!!logViewer} onOpenChange={(open) => !open && setLogViewer(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Run Log</DialogTitle>
            <DialogDescription>
              Output from run {logViewer?.runId}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[500px] border rounded-md bg-muted/50 overflow-auto">
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
              {logViewer?.content ? parseLogToPlainText(logViewer.content) : 'No output'}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setLogViewer(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live Output Dialog */}
      <Dialog open={!!showLiveOutput} onOpenChange={(open) => !open && setShowLiveOutput(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {agents.find(a => a.name === showLiveOutput)?.is_running ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              Output - {showLiveOutput}
            </DialogTitle>
            <DialogDescription>
              {agents.find(a => a.name === showLiveOutput)?.is_running
                ? 'Agent is running... (polling for updates)'
                : 'Run completed'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px] border rounded-md bg-muted/50">
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
              {liveOutput
                .filter(e => e.agent_name === showLiveOutput)
                .map((e, i) => {
                  // Try to parse JSON log entries for nicer display
                  try {
                    const parsed = JSON.parse(e.content);
                    if (parsed.type === 'assistant' && parsed.message?.content) {
                      return parsed.message.content.map((block: { type: string; text?: string; name?: string }, j: number) => {
                        if (block.type === 'text' && block.text) {
                          return <div key={`${i}-${j}`} className="text-foreground mb-2">{block.text}</div>;
                        }
                        if (block.type === 'tool_use' && block.name) {
                          return <div key={`${i}-${j}`} className="text-blue-400">Tool: {block.name}</div>;
                        }
                        return null;
                      });
                    }
                    if (parsed.type === 'result') {
                      return (
                        <div key={i} className="text-green-400 mt-2 pt-2 border-t border-border">
                          {parsed.result || 'Completed'}
                          {parsed.duration_ms && <span className="text-muted-foreground ml-2">({(parsed.duration_ms / 1000).toFixed(1)}s)</span>}
                        </div>
                      );
                    }
                    // Skip system init messages
                    if (parsed.type === 'system') return null;
                    // For other JSON, show raw
                    return null;
                  } catch {
                    // Not JSON, show as-is
                    return (
                      <div key={i} className={e.event_type === 'stderr' ? 'text-red-400' : ''}>
                        {e.content}
                      </div>
                    );
                  }
                })}
              {liveOutput.filter(e => e.agent_name === showLiveOutput).length === 0 && (
                <span className="text-muted-foreground">
                  {agents.find(a => a.name === showLiveOutput)?.is_running
                    ? 'Starting agent...'
                    : 'No output available'}
                </span>
              )}
            </pre>
          </ScrollArea>
          <DialogFooter>
            {agents.find(a => a.name === showLiveOutput)?.is_running && (
              <Button variant="destructive" onClick={() => showLiveOutput && handleCancel(showLiveOutput)}>
                <Square className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button onClick={() => setShowLiveOutput(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
