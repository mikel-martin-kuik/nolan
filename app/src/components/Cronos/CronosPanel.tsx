import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Plus, RefreshCw, Clock, FileText } from 'lucide-react';
import { CronAgentCard } from './CronAgentCard';
import { CronAgentDetailPage } from './CronAgentDetailPage';
import { CronAgentOutputModal } from './CronAgentOutputModal';
import { useToastStore } from '../../store/toastStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CronAgentInfo, CronAgentConfig } from '@/types';
import { CRON_PRESETS, CRON_MODELS, AGENT_TEMPLATES, createDefaultCronAgentConfig } from '@/types/cronos';

export const CronosPanel: React.FC = () => {
  const [agents, setAgents] = useState<CronAgentInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Navigation state
  const [selectedAgentPage, setSelectedAgentPage] = useState<string | null>(null);
  const [outputModalAgent, setOutputModalAgent] = useState<string | null>(null);

  // Dialog states
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  // Initialize and load data
  useEffect(() => {
    const init = async () => {
      try {
        await invoke('init_cronos');
      } catch { /* might already be initialized */ }
      fetchAgents();
    };
    init();
  }, [fetchAgents]);

  // Auto-refresh when there are running agents
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

  // Handle agent delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      await invoke('delete_cron_agent', { name: deleteConfirm });
      showSuccess(`Deleted ${deleteConfirm}`);
      setDeleteConfirm(null);
      setSelectedAgentPage(null);
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
      // Open output modal to show the running agent
      setOutputModalAgent(name);
      setTimeout(fetchAgents, 500);
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
    } catch (err) {
      showError(`Failed to cancel agent: ${err}`);
    }
  }, [showError, showSuccess, fetchAgents]);

  // Handle card click - show output modal if running, otherwise show detail page
  const handleCardClick = useCallback((name: string) => {
    const agent = agents.find(a => a.name === name);
    if (agent?.is_running) {
      setOutputModalAgent(name);
    } else {
      setSelectedAgentPage(name);
    }
  }, [agents]);

  // Handle viewing output from audit log (in detail page)
  const handleViewOutput = useCallback(async (_runId: string) => {
    // Open the output modal for the selected agent
    // TODO: Pass runId to modal to load specific run's output
    if (selectedAgentPage) {
      setOutputModalAgent(selectedAgentPage);
    }
  }, [selectedAgentPage]);

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

  // If showing detail page, render it
  if (selectedAgentPage) {
    return (
      <div className="h-full flex flex-col">
        <CronAgentDetailPage
          agentName={selectedAgentPage}
          onBack={() => {
            setSelectedAgentPage(null);
            fetchAgents();
          }}
          onTrigger={handleTrigger}
          onDelete={(name) => {
            setDeleteConfirm(name);
          }}
          onViewOutput={handleViewOutput}
        />

        {/* Output Modal - can be opened from detail page */}
        <CronAgentOutputModal
          agentName={outputModalAgent}
          onClose={() => setOutputModalAgent(null)}
          onCancel={handleCancel}
        />

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
      </div>
    );
  }

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

      {/* Agent Cards Grid */}
      <div className="flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Clock className="w-12 h-12 mb-4 opacity-50" />
            <p>No cron agents configured</p>
            <p className="text-sm">Create your first scheduled agent</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {agents.map((agent) => (
              <CronAgentCard
                key={agent.name}
                agent={agent}
                onTrigger={handleTrigger}
                onDelete={(name) => setDeleteConfirm(name)}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Output Modal - for running agents */}
      <CronAgentOutputModal
        agentName={outputModalAgent}
        onClose={() => setOutputModalAgent(null)}
        onCancel={handleCancel}
      />

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
    </div>
  );
};
