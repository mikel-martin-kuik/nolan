import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, RefreshCw, Play, Settings, Trash2, Code, Clock, History, Wrench } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CronAgentInfo, CronAgentConfig, CronRunLog, CronRunStatus } from '@/types';
import { CRON_PRESETS, CRON_MODELS, createDefaultCronAgentConfig } from '@/types/cronos';

function getStatusBadgeVariant(status: CronRunStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'success': return 'default';
    case 'failed': return 'destructive';
    case 'running': return 'secondary';
    default: return 'outline';
  }
}

export const CronosPanel: React.FC = () => {
  const [agents, setAgents] = useState<CronAgentInfo[]>([]);
  const [runHistory, setRunHistory] = useState<CronRunLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('factory');

  // Dialog states
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editorAgent, setEditorAgent] = useState<CronAgentConfig | null>(null);
  const [instructionsAgent, setInstructionsAgent] = useState<string | null>(null);
  const [instructionsContent, setInstructionsContent] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [logViewer, setLogViewer] = useState<{ runId: string; content: string } | null>(null);

  // Form state for creator
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentConfig, setNewAgentConfig] = useState<CronAgentConfig | null>(null);

  const { error: showError, success: showSuccess } = useToastStore();

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

  // Initial load
  useEffect(() => {
    fetchAgents();
    fetchRunHistory();
  }, [fetchAgents, fetchRunHistory]);

  // Refresh on tab change
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchRunHistory();
    }
  }, [activeTab, fetchRunHistory]);

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
      // Refresh history after a delay to catch the new run
      setTimeout(fetchRunHistory, 2000);
    } catch (err) {
      showError(`Failed to trigger agent: ${err}`);
    }
  }, [showError, showSuccess, fetchRunHistory]);

  // Handle edit instructions (CLAUDE.md)
  const handleEditInstructions = useCallback(async (name: string) => {
    try {
      const content = await invoke<string>('read_cron_agent_claude_md', { name });
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
          <Button variant="ghost" size="icon" onClick={fetchAgents} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setCreatorOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 mb-4">
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
                <Card key={agent.name} className="group hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <CardDescription className="mt-1">{agent.description || 'No description'}</CardDescription>
                      </div>
                      <Badge variant={agent.enabled ? 'default' : 'secondary'}>
                        {agent.enabled ? 'Active' : 'Inactive'}
                      </Badge>
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
                      {agent.next_run && (
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
                      <Button variant="ghost" size="icon" onClick={() => handleTrigger(agent.name)} title="Run now">
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEditInstructions(agent.name)} title="Edit instructions">
                        <Code className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => loadAgentForEdit(agent.name)} title="Settings">
                        <Settings className="w-4 h-4" />
                      </Button>
                      <div className="flex-1" />
                      <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(agent.name)} title="Delete">
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
                    <Checkbox
                      checked={agent.enabled}
                      onCheckedChange={(checked: boolean) => handleToggle(agent.name, checked)}
                    />
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">{agent.schedule}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agent.next_run && (
                      <span className="text-sm text-muted-foreground">
                        Next: {new Date(agent.next_run).toLocaleString()}
                      </span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleTrigger(agent.name)}>
                      <Play className="w-4 h-4 mr-1" />
                      Run Now
                    </Button>
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
      </Tabs>

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
        <DialogContent className="max-w-lg">
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
              <div className="flex items-center gap-2">
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
              {logViewer?.content || 'No output'}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setLogViewer(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
