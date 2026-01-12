import React, { useState, useCallback, useEffect } from 'react';
import { CronAgentCard } from './CronAgentCard';
import { CronAgentDetailPage } from './CronAgentDetailPage';
import { CronGroupEditor } from './CronGroupEditor';
import { TaskMonitoringDashboard } from './TaskMonitoringDashboard';
import { useCronOutputStore } from '../../store/cronOutputStore';
import { useCollapsedCronGroupsStore } from '../../store/collapsedCronGroupsStore';
import { useNavigationStore } from '../../store/navigationStore';
import { useCronosAgents } from '../../hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import type { CronAgentInfo, CronAgentConfig } from '@/types';
import { CRON_PRESETS, CRON_MODELS, AGENT_TEMPLATES, createDefaultCronAgentConfig } from '@/types/cronos';

export const CronosPanel: React.FC = () => {
  // Data fetching with custom hook
  const {
    agents,
    groups,
    groupedAgents,
    loading,
    hasRunningAgents,
    refreshAgents,
    refreshGroups,
    createAgent,
    deleteAgent,
    triggerAgent,
    toggleAgentEnabled,
  } = useCronosAgents();

  // Collapsed groups state (persisted)
  const { isCollapsed, toggleCollapsed } = useCollapsedCronGroupsStore();

  // Navigation context for deep-linking
  const { context, clearContext } = useNavigationStore();

  // Navigation state
  const [selectedAgentPage, setSelectedAgentPage] = useState<string | null>(null);
  const { openOutput } = useCronOutputStore();

  // Handle deep-linking from navigation context
  useEffect(() => {
    if (context.cronAgentName) {
      setSelectedAgentPage(context.cronAgentName);
      clearContext();
    }
  }, [context.cronAgentName, clearContext]);

  // Dialog states
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state for creator
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentConfig, setNewAgentConfig] = useState<CronAgentConfig | null>(null);
  const [newAgentGroup, setNewAgentGroup] = useState<string>('');

  // Handle agent creation
  const handleCreate = useCallback(async () => {
    const success = await createAgent(newAgentName, newAgentConfig, newAgentGroup);
    if (success) {
      setCreatorOpen(false);
      setNewAgentName('');
      setNewAgentConfig(null);
      setNewAgentGroup('');
    }
  }, [newAgentName, newAgentConfig, newAgentGroup, createAgent]);

  // Handle agent delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const success = await deleteAgent(deleteConfirm);
    if (success) {
      setDeleteConfirm(null);
      setSelectedAgentPage(null);
    }
  }, [deleteConfirm, deleteAgent]);

  // Handle trigger run
  const handleTrigger = useCallback(async (name: string) => {
    await triggerAgent(name);
  }, [triggerAgent]);

  // Handle toggle enabled
  const handleToggleEnabled = useCallback(async (name: string, enabled: boolean) => {
    await toggleAgentEnabled(name, enabled);
  }, [toggleAgentEnabled]);

  // Handle card click - navigate to detail page (and open output panel if running)
  const handleCardClick = useCallback((name: string) => {
    const agent = agents.find(a => a.name === name);
    if (agent?.is_running) {
      openOutput(name);
    }
    setSelectedAgentPage(name);
  }, [agents, openOutput]);

  // Handle viewing output from audit log (in detail page)
  const handleViewOutput = useCallback(async (_runId: string) => {
    // Open the output panel for the selected agent
    // TODO: Pass runId to panel to load specific run's output
    if (selectedAgentPage) {
      openOutput(selectedAgentPage);
    }
  }, [selectedAgentPage, openOutput]);

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

  // Render agent cards for a group
  const renderAgentCards = (agentList: CronAgentInfo[]) => (
    <div className="flex flex-wrap gap-2 lg:gap-3">
      {agentList.map((agent) => (
        <div key={agent.name} className="w-[clamp(180px,calc(100%/4-12px),220px)]">
          <CronAgentCard
            agent={agent}
            onTrigger={handleTrigger}
            onDelete={(name) => setDeleteConfirm(name)}
            onToggleEnabled={handleToggleEnabled}
            onClick={handleCardClick}
          />
        </div>
      ))}
    </div>
  );

  // If showing detail page, render it
  if (selectedAgentPage) {
    return (
      <div className="h-full flex flex-col">
        <CronAgentDetailPage
          agentName={selectedAgentPage}
          onBack={() => {
            setSelectedAgentPage(null);
            refreshAgents();
          }}
          onTrigger={handleTrigger}
          onDelete={(name) => {
            setDeleteConfirm(name);
          }}
          onViewOutput={handleViewOutput}
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
    <div className="h-full">
      <div className="w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            size="sm"
            onClick={() => setCreatorOpen(true)}
          >
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplateSelectorOpen(true)}
          >
            Templates
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGroupEditorOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Groups
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { refreshGroups(); refreshAgents(); }}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <div className="flex-1" />
        </div>

        {/* Task Monitoring Dashboard */}
        <div className="mb-4">
          <TaskMonitoringDashboard refreshInterval={hasRunningAgents ? 3000 : 15000} />
        </div>

        {/* Agent Cards - Grouped */}
        <div className="flex-1 min-h-0 overflow-auto space-y-4">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <p>No cron agents configured</p>
              <p className="text-sm mt-1">Create your first scheduled agent</p>
            </div>
          ) : (
            <>
              {/* Render each group */}
              {groups.map((group) => {
                const groupAgents = groupedAgents.grouped[group.id] || [];
                if (groupAgents.length === 0) return null;

                const collapsed = isCollapsed(group.id);
                const enabledCount = groupAgents.filter(a => a.enabled).length;
                const runningCount = groupAgents.filter(a => a.is_running).length;

                return (
                  <Collapsible
                    key={group.id}
                    open={!collapsed}
                    onOpenChange={() => toggleCollapsed(group.id)}
                  >
                    <div className="border border-border/50 rounded-lg overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <div
                          className="flex items-center gap-3 px-3 py-2 bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors"
                        >
                          {collapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">{group.name}</span>
                          <div className="ml-auto flex items-center gap-2">
                            {runningCount > 0 && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-blue-500">
                                {runningCount} running
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                              {enabledCount}/{groupAgents.length}
                            </Badge>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3">
                          {renderAgentCards(groupAgents)}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}

              {/* Ungrouped agents */}
              {groupedAgents.ungrouped.length > 0 && (
                <Collapsible
                  open={!isCollapsed('__ungrouped__')}
                  onOpenChange={() => toggleCollapsed('__ungrouped__')}
                >
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div
                        className="flex items-center gap-3 px-3 py-2 bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors"
                      >
                        {isCollapsed('__ungrouped__') ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">Ungrouped</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 ml-auto">
                          {groupedAgents.ungrouped.filter(a => a.enabled).length}/{groupedAgents.ungrouped.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-3">
                        {renderAgentCards(groupedAgents.ungrouped)}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}
            </>
          )}
        </div>


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
              <label htmlFor="group" className="text-sm font-medium">Group</label>
              <Select
                value={newAgentGroup || '__none__'}
                onValueChange={(val) => setNewAgentGroup(val === '__none__' ? '' : val)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a group (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No group</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="schedule" className="text-sm font-medium">Schedule</label>
              <Select
                value={newAgentConfig?.schedule?.cron || '0 9 * * 1'}
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
                value={newAgentConfig?.model || 'opus'}
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

      {/* Group Editor Dialog */}
      <CronGroupEditor
        open={groupEditorOpen}
        onOpenChange={setGroupEditorOpen}
        groups={groups}
        agents={agents}
        onGroupsChange={refreshGroups}
        onAgentsChange={refreshAgents}
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
    </div>
  );
};
