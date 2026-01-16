import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { useNavigationStore } from '../../store/navigationStore';
import { useToastStore } from '../../store/toastStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  GitBranch,
  Plus,
  Settings,
  Trash2,
  Code,
  Search,
  GitMerge,
  Lightbulb,
  ArrowRight,
  GripVertical,
  Pencil,
} from 'lucide-react';
import type { PipelineDefinition } from '../../types/generated/scheduler/PipelineDefinition';
import type { PipelineStageDefinition } from '../../types/generated/scheduler/PipelineStageDefinition';
import type { ScheduledAgentInfo } from '../../types';

const stageIcons: Record<string, typeof Code> = {
  idea: Lightbulb,
  implementer: Code,
  analyzer: Search,
  merger: GitMerge,
};

export function PipelineEditor() {
  const { success, error: showError } = useToastStore();
  const context = useNavigationStore((state) => state.context);
  const clearContext = useNavigationStore((state) => state.clearContext);

  // Pipeline list state
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Available agents for dropdown
  const [agents, setAgents] = useState<ScheduledAgentInfo[]>([]);

  // Create pipeline modal
  const [createModal, setCreateModal] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineDescription, setNewPipelineDescription] = useState('');

  // Pipeline settings modal
  const [settingsModal, setSettingsModal] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedVersion, setEditedVersion] = useState('');

  // Stage edit modal
  const [stageModal, setStageModal] = useState<{ stage: PipelineStageDefinition; index: number } | null>(null);
  const [editedStage, setEditedStage] = useState<PipelineStageDefinition | null>(null);

  // Add stage modal
  const [addStageModal, setAddStageModal] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageAgent, setNewStageAgent] = useState('');
  const [newStageDescription, setNewStageDescription] = useState('');

  // Delete confirmation
  const [deletePipelineName, setDeletePipelineName] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pipeline: PipelineDefinition } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Stage context menu
  const [stageContextMenu, setStageContextMenu] = useState<{ x: number; y: number; stage: PipelineStageDefinition; index: number } | null>(null);
  const stageContextMenuRef = useRef<HTMLDivElement>(null);

  // Load pipelines
  const loadPipelines = useCallback(async () => {
    try {
      const defs = await invoke<PipelineDefinition[]>('list_pipeline_definitions');
      setPipelines(defs);
      return defs;
    } catch (err) {
      showError(`Failed to load pipelines: ${err}`);
      return [];
    }
  }, [showError]);

  // Load available agents
  const loadAgents = useCallback(async () => {
    try {
      const agentList = await invoke<ScheduledAgentInfo[]>('list_scheduled_agents');
      setAgents(agentList);
    } catch (err) {
      // Silently fail - agents dropdown will just be empty
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadAgents();
      const defs = await loadPipelines();
      // Auto-select first pipeline if none selected
      if (defs.length > 0 && !selectedPipeline) {
        setSelectedPipeline(defs[0]);
      }
      setLoading(false);
    };
    load();
  }, [loadPipelines, loadAgents, selectedPipeline]);

  // Handle navigation context (deep linking)
  useEffect(() => {
    if (context.pipelineId && pipelines.length > 0) {
      const pipeline = pipelines.find(p => p.name === context.pipelineId);
      if (pipeline) {
        setSelectedPipeline(pipeline);
      }
      clearContext();
    }
  }, [context.pipelineId, pipelines, clearContext]);

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, pipeline: PipelineDefinition) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, pipeline });
  };

  const handleStageContextMenu = (e: React.MouseEvent, stage: PipelineStageDefinition, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setStageContextMenu({ x: e.clientX, y: e.clientY, stage, index });
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
    if (stageContextMenuRef.current && !stageContextMenuRef.current.contains(e.target as Node)) {
      setStageContextMenu(null);
    }
  }, []);

  useEffect(() => {
    if (!contextMenu && !stageContextMenu) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu, stageContextMenu, handleClickOutside]);

  // Save pipeline
  const savePipeline = async (pipeline: PipelineDefinition) => {
    setSaving(true);
    try {
      await invoke('save_pipeline_definition', { definition: pipeline });
      await loadPipelines();
      setSelectedPipeline(pipeline);
      success('Pipeline saved');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Create new pipeline
  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim()) return;

    const newPipeline: PipelineDefinition = {
      name: newPipelineName.trim().toLowerCase().replace(/\s+/g, '-'),
      description: newPipelineDescription || null,
      version: '1.0.0',
      stages: [
        {
          name: 'implementer',
          agent: 'cron-idea-implementer',
          description: 'Implements the task',
          transitions: { on_success: 'analyzer', on_failure: 'failed', on_complete: null, on_followup: null, on_failed: null },
          skippable: false,
          retryable: true,
          max_retries: 3,
        },
        {
          name: 'analyzer',
          agent: 'cron-implementer-analyzer',
          description: 'Analyzes the implementation',
          transitions: { on_success: null, on_failure: null, on_complete: 'merger', on_followup: 'implementer', on_failed: 'failed' },
          skippable: false,
          retryable: true,
          max_retries: 2,
        },
        {
          name: 'merger',
          agent: 'pred-merge-changes',
          description: 'Merges the changes',
          transitions: { on_success: 'completed', on_failure: 'failed', on_complete: null, on_followup: null, on_failed: null },
          skippable: false,
          retryable: true,
          max_retries: 1,
        },
      ],
    };

    await savePipeline(newPipeline);
    setCreateModal(false);
    setNewPipelineName('');
    setNewPipelineDescription('');
  };

  // Delete pipeline
  const handleDeletePipeline = async (name: string) => {
    try {
      await invoke('delete_pipeline_definition', { name });
      await loadPipelines();
      if (selectedPipeline?.name === name) {
        setSelectedPipeline(pipelines.length > 1 ? pipelines.find(p => p.name !== name) || null : null);
      }
      success('Pipeline deleted');
    } catch (err) {
      showError(`Failed to delete: ${err}`);
    }
    setDeletePipelineName(null);
  };

  // Open settings modal
  const openSettingsModal = () => {
    if (!selectedPipeline) return;
    setEditedName(selectedPipeline.name);
    setEditedDescription(selectedPipeline.description || '');
    setEditedVersion(selectedPipeline.version);
    setSettingsModal(true);
  };

  // Save settings
  const handleSaveSettings = async () => {
    if (!selectedPipeline) return;
    const updated: PipelineDefinition = {
      ...selectedPipeline,
      name: editedName,
      description: editedDescription || null,
      version: editedVersion,
    };
    await savePipeline(updated);
    setSettingsModal(false);
  };

  // Edit stage
  const handleEditStage = (stage: PipelineStageDefinition, index: number) => {
    setStageModal({ stage, index });
    setEditedStage({ ...stage });
    setStageContextMenu(null);
  };

  // Save stage
  const handleSaveStage = async () => {
    if (!selectedPipeline || !editedStage || stageModal === null) return;
    const newStages = [...selectedPipeline.stages];
    newStages[stageModal.index] = editedStage;
    const updated: PipelineDefinition = { ...selectedPipeline, stages: newStages };
    await savePipeline(updated);
    setStageModal(null);
    setEditedStage(null);
  };

  // Add stage
  const handleAddStage = async () => {
    if (!selectedPipeline || !newStageName.trim() || !newStageAgent.trim()) return;

    const newStage: PipelineStageDefinition = {
      name: newStageName.trim().toLowerCase().replace(/\s+/g, '-'),
      agent: newStageAgent.trim(),
      description: newStageDescription || null,
      transitions: { on_success: null, on_failure: 'failed', on_complete: null, on_followup: null, on_failed: null },
      skippable: false,
      retryable: true,
      max_retries: 3,
    };

    const updated: PipelineDefinition = {
      ...selectedPipeline,
      stages: [...selectedPipeline.stages, newStage],
    };
    await savePipeline(updated);
    setAddStageModal(false);
    setNewStageName('');
    setNewStageAgent('');
    setNewStageDescription('');
  };

  // Delete stage
  const handleDeleteStage = async (index: number) => {
    if (!selectedPipeline) return;
    const newStages = selectedPipeline.stages.filter((_, i) => i !== index);
    const updated: PipelineDefinition = { ...selectedPipeline, stages: newStages };
    await savePipeline(updated);
    setStageContextMenu(null);
  };

  // Move stage
  const moveStage = async (index: number, direction: 'up' | 'down') => {
    if (!selectedPipeline) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedPipeline.stages.length) return;

    const newStages = [...selectedPipeline.stages];
    [newStages[index], newStages[newIndex]] = [newStages[newIndex], newStages[index]];

    const updated: PipelineDefinition = { ...selectedPipeline, stages: newStages };
    await savePipeline(updated);
    setStageContextMenu(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading pipelines...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Editor</h2>
          <p className="text-sm text-muted-foreground">Configure pipeline stages and transitions</p>
        </div>
        <Button onClick={() => setCreateModal(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Pipeline
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 overflow-hidden">
        {/* Pipeline List */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Pipelines
              <Badge variant="secondary" className="ml-auto">{pipelines.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2 space-y-2">
            {pipelines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <GitBranch className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No pipelines defined</p>
                <p className="text-xs">Create one to get started</p>
              </div>
            ) : (
              pipelines.map((pipeline) => (
                <button
                  key={pipeline.name}
                  onClick={() => setSelectedPipeline(pipeline)}
                  onContextMenu={(e) => handleContextMenu(e, pipeline)}
                  className={cn(
                    'w-full p-3 rounded-lg border text-left transition-colors',
                    selectedPipeline?.name === pipeline.name
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium truncate">{pipeline.name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">v{pipeline.version}</Badge>
                  </div>
                  {pipeline.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{pipeline.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    {pipeline.stages.map((stage, i) => {
                      const StageIcon = stageIcons[stage.name] || Code;
                      return (
                        <div key={stage.name} className="flex items-center">
                          <StageIcon className="h-3 w-3 text-muted-foreground" />
                          {i < pipeline.stages.length - 1 && (
                            <ArrowRight className="h-2 w-2 text-muted-foreground/50 mx-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pipeline Detail / Stage Editor */}
        <Card className="md:col-span-2 flex flex-col overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              {selectedPipeline ? (
                <span className="flex items-center gap-2">
                  <span>{selectedPipeline.name}</span>
                  <Badge variant="outline">v{selectedPipeline.version}</Badge>
                </span>
              ) : (
                'Select a pipeline'
              )}
            </CardTitle>
            {selectedPipeline && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openSettingsModal} className="gap-1">
                  <Settings className="h-3 w-3" />
                  Settings
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddStageModal(true)} className="gap-1">
                  <Plus className="h-3 w-3" />
                  Add Stage
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4">
            {!selectedPipeline ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <GitBranch className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a pipeline to edit</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pipeline flow visualization */}
                <div className="flex items-center justify-center gap-2 py-4 px-2 bg-muted/30 rounded-lg">
                  {selectedPipeline.stages.map((stage, index) => {
                    const StageIcon = stageIcons[stage.name] || Code;
                    return (
                      <div key={stage.name} className="flex items-center">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <StageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <span className="text-xs mt-1 capitalize">{stage.name}</span>
                        </div>
                        {index < selectedPipeline.stages.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Stage list */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Stages</h4>
                  {selectedPipeline.stages.map((stage, index) => {
                    const StageIcon = stageIcons[stage.name] || Code;
                    return (
                      <div
                        key={stage.name}
                        className="p-3 border rounded-lg bg-card hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => handleEditStage(stage, index)}
                        onContextMenu={(e) => handleStageContextMenu(e, stage, index)}
                      >
                        <div className="flex items-center gap-2">
                          <StageIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium capitalize">{stage.name}</span>
                          <div className="flex gap-1 ml-auto">
                            {stage.retryable && (
                              <Badge variant="outline" className="text-xs">retryable×{stage.max_retries}</Badge>
                            )}
                            {stage.skippable && (
                              <Badge variant="outline" className="text-xs">skippable</Badge>
                            )}
                          </div>
                        </div>
                        {stage.description && (
                          <p className="text-sm text-muted-foreground mt-1">{stage.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="font-mono bg-muted px-1 rounded">{stage.agent}</span>
                          {stage.transitions.on_success && (
                            <span>→ {stage.transitions.on_success}</span>
                          )}
                          {stage.transitions.on_complete && (
                            <span>✓ {stage.transitions.on_complete}</span>
                          )}
                          {stage.transitions.on_followup && (
                            <span>↺ {stage.transitions.on_followup}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Pipeline Modal */}
      <Dialog open={createModal} onOpenChange={setCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Pipeline</DialogTitle>
            <DialogDescription>Create a new pipeline definition with default stages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                className="mt-1"
                placeholder="my-pipeline"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                className="mt-1"
                placeholder="Pipeline description"
                value={newPipelineDescription}
                onChange={(e) => setNewPipelineDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateModal(false)}>Cancel</Button>
              <Button onClick={handleCreatePipeline} disabled={!newPipelineName.trim() || saving}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings Modal */}
      <Dialog open={settingsModal} onOpenChange={setSettingsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pipeline Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                className="mt-1"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                className="mt-1"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Version</label>
              <Input
                className="mt-1"
                value={editedVersion}
                onChange={(e) => setEditedVersion(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSettingsModal(false)}>Cancel</Button>
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stage Edit Modal */}
      <Dialog open={!!stageModal} onOpenChange={(open) => !open && setStageModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Stage: {editedStage?.name}</DialogTitle>
          </DialogHeader>
          {editedStage && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  className="mt-1"
                  value={editedStage.name}
                  onChange={(e) => setEditedStage({ ...editedStage, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Agent</label>
                <Select value={editedStage.agent} onValueChange={(v) => setEditedStage({ ...editedStage, agent: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  className="mt-1"
                  value={editedStage.description || ''}
                  onChange={(e) => setEditedStage({ ...editedStage, description: e.target.value || null })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">On Success</label>
                  <Input
                    className="mt-1"
                    placeholder="next stage or 'completed'"
                    value={editedStage.transitions.on_success || ''}
                    onChange={(e) => setEditedStage({
                      ...editedStage,
                      transitions: { ...editedStage.transitions, on_success: e.target.value || null }
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">On Failure</label>
                  <Input
                    className="mt-1"
                    placeholder="'failed' or retry stage"
                    value={editedStage.transitions.on_failure || ''}
                    onChange={(e) => setEditedStage({
                      ...editedStage,
                      transitions: { ...editedStage.transitions, on_failure: e.target.value || null }
                    })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">On Complete</label>
                  <Input
                    className="mt-1"
                    placeholder="For analyzer"
                    value={editedStage.transitions.on_complete || ''}
                    onChange={(e) => setEditedStage({
                      ...editedStage,
                      transitions: { ...editedStage.transitions, on_complete: e.target.value || null }
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">On Followup</label>
                  <Input
                    className="mt-1"
                    placeholder="For analyzer"
                    value={editedStage.transitions.on_followup || ''}
                    onChange={(e) => setEditedStage({
                      ...editedStage,
                      transitions: { ...editedStage.transitions, on_followup: e.target.value || null }
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">On Failed</label>
                  <Input
                    className="mt-1"
                    placeholder="For analyzer"
                    value={editedStage.transitions.on_failed || ''}
                    onChange={(e) => setEditedStage({
                      ...editedStage,
                      transitions: { ...editedStage.transitions, on_failed: e.target.value || null }
                    })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={editedStage.retryable}
                    onCheckedChange={(checked) => setEditedStage({ ...editedStage, retryable: !!checked })}
                  />
                  <span className="text-sm">Retryable</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={editedStage.skippable}
                    onCheckedChange={(checked) => setEditedStage({ ...editedStage, skippable: !!checked })}
                  />
                  <span className="text-sm">Skippable</span>
                </div>
                {editedStage.retryable && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Max Retries:</span>
                    <Input
                      className="w-16 h-8"
                      type="number"
                      min={1}
                      value={editedStage.max_retries}
                      onChange={(e) => setEditedStage({ ...editedStage, max_retries: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStageModal(null)}>Cancel</Button>
                <Button onClick={handleSaveStage} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Stage'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Stage Modal */}
      <Dialog open={addStageModal} onOpenChange={setAddStageModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Stage Name</label>
              <Input
                className="mt-1"
                placeholder="e.g., validator"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Agent</label>
              <Select value={newStageAgent} onValueChange={setNewStageAgent}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.name} value={agent.name}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                className="mt-1"
                placeholder="Stage description"
                value={newStageDescription}
                onChange={(e) => setNewStageDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddStageModal(false)}>Cancel</Button>
              <Button onClick={handleAddStage} disabled={!newStageName.trim() || !newStageAgent.trim() || saving}>
                {saving ? 'Adding...' : 'Add Stage'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Pipeline Confirmation */}
      <AlertDialog open={!!deletePipelineName} onOpenChange={(open) => !open && setDeletePipelineName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletePipelineName}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletePipelineName && handleDeletePipeline(deletePipelineName)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pipeline Context Menu */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setSelectedPipeline(contextMenu.pipeline);
              openSettingsModal();
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => {
              setDeletePipelineName(contextMenu.pipeline.name);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-destructive hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>,
        document.body
      )}

      {/* Stage Context Menu */}
      {stageContextMenu && createPortal(
        <div
          ref={stageContextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: stageContextMenu.x, top: stageContextMenu.y }}
        >
          <button
            onClick={() => handleEditStage(stageContextMenu.stage, stageContextMenu.index)}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          {stageContextMenu.index > 0 && (
            <button
              onClick={() => moveStage(stageContextMenu.index, 'up')}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <GripVertical className="w-4 h-4" />
              Move Up
            </button>
          )}
          {selectedPipeline && stageContextMenu.index < selectedPipeline.stages.length - 1 && (
            <button
              onClick={() => moveStage(stageContextMenu.index, 'down')}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <GripVertical className="w-4 h-4" />
              Move Down
            </button>
          )}
          <button
            onClick={() => handleDeleteStage(stageContextMenu.index)}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-destructive hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
