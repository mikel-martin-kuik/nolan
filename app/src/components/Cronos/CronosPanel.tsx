import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { CronAgentCard } from './CronAgentCard';
import { CronAgentDetailPage } from './CronAgentDetailPage';
import { TeamAgentDetailPage } from './TeamAgentDetailPage';
import { CronGroupEditor } from './CronGroupEditor';
import { TaskMonitoringDashboard } from './TaskMonitoringDashboard';
import { TemplateCard } from '../AgentConsole/TemplateCard';
import { useCronOutputStore } from '../../store/cronOutputStore';
import { useCollapsedCronGroupsStore } from '../../store/collapsedCronGroupsStore';
import { useNavigationStore } from '../../store/navigationStore';
import { useCronosAgents, useAgentTemplates } from '../../hooks';
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

  // Agent templates (embedded in binary)
  const {
    templates,
    installing,
    installTemplate,
    refreshTemplates,
  } = useAgentTemplates();

  // Available (not installed) templates
  const availableTemplates = useMemo(
    () => templates.filter(t => !t.installed),
    [templates]
  );

  // Handle template install
  const handleInstallTemplate = useCallback(async (name: string) => {
    const success = await installTemplate(name);
    if (success) {
      // Refresh agents list after install
      setTimeout(refreshAgents, 500);
    }
  }, [installTemplate, refreshAgents]);

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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 lg:gap-3">
      {agentList.map((agent) => (
        <CronAgentCard
          key={agent.name}
          agent={agent}
          onTrigger={handleTrigger}
          onDelete={(name) => setDeleteConfirm(name)}
          onToggleEnabled={handleToggleEnabled}
          onClick={handleCardClick}
        />
      ))}
    </div>
  );

  // Determine if selected agent is a team-type agent
  const selectedAgent = useMemo(() => {
    if (!selectedAgentPage) return null;
    return agents.find(a => a.name === selectedAgentPage) || null;
  }, [selectedAgentPage, agents]);

  const isTeamAgent = selectedAgent?.agent_type === 'team';

  // If showing detail page, render the appropriate one based on agent type
  if (selectedAgentPage) {
    // Team agents get the TeamAgentDetailPage with workflow visualization
    if (isTeamAgent) {
      return (
        <div className="h-full flex flex-col">
          <TeamAgentDetailPage
            agentName={selectedAgentPage}
            onBack={() => {
              setSelectedAgentPage(null);
              refreshAgents();
            }}
          />
        </div>
      );
    }

    // Regular cron/predefined/event agents get the standard detail page
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
        <div className="flex flex-wrap items-center gap-2 mb-2 sm:mb-4">
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
            <span className="hidden sm:inline">Templates</span>
            <span className="sm:hidden">Tmplt</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGroupEditorOpen(true)}
          >
            <Settings2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Groups</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { refreshGroups(); refreshAgents(); refreshTemplates(); }}
            disabled={loading}
          >
            {loading ? '...' : 'Refresh'}
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
              <p>No agents configured</p>
              <p className="text-sm mt-1">Create your first agent</p>
            </div>
          ) : (
            <>
              {/* Type labels for agent_type groups */}
              {(() => {
                const typeLabels: Record<string, string> = {
                  'type:predefined': 'On-Demand',
                  'type:cron': 'Scheduled',
                  'type:event': 'Event-Driven',
                  'type:team': 'Teams',
                };

                // Get type-based groups from grouped agents
                const typeGroups = Object.keys(groupedAgents.grouped).filter(k => k.startsWith('type:'));

                return (
                  <>
                    {/* Render type-based groups first */}
                    {typeGroups.map((groupKey) => {
                      const groupAgents = groupedAgents.grouped[groupKey] || [];
                      const isPredefinedGroup = groupKey === 'type:predefined';
                      // Show predefined group even if empty (to show available templates)
                      if (groupAgents.length === 0 && !isPredefinedGroup) return null;
                      if (groupAgents.length === 0 && isPredefinedGroup && availableTemplates.length === 0) return null;

                      const collapsed = isCollapsed(groupKey);
                      const enabledCount = groupAgents.filter(a => a.enabled).length;
                      const runningCount = groupAgents.filter(a => a.is_running).length;
                      const displayName = typeLabels[groupKey] || groupKey.replace('type:', '');

                      return (
                        <Collapsible
                          key={groupKey}
                          open={!collapsed}
                          onOpenChange={() => toggleCollapsed(groupKey)}
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
                                <span className="font-medium text-sm">{displayName}</span>
                                <div className="ml-auto flex items-center gap-2">
                                  {runningCount > 0 && (
                                    <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-blue-500">
                                      {runningCount} running
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                    {enabledCount}/{groupAgents.length}
                                  </Badge>
                                  {isPredefinedGroup && availableTemplates.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                      {availableTemplates.length} available
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="p-3 space-y-4">
                                {/* Installed agents */}
                                {groupAgents.length > 0 && renderAgentCards(groupAgents)}

                                {/* Available templates (only for predefined group) */}
                                {isPredefinedGroup && availableTemplates.length > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-2 font-medium">
                                      Available Templates
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 lg:gap-3">
                                      {availableTemplates.map((template) => (
                                        <TemplateCard
                                          key={template.name}
                                          template={template}
                                          onInstall={handleInstallTemplate}
                                          isInstalling={installing === template.name}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}

                    {/* Show On-Demand section even if no agents but templates available */}
                    {!typeGroups.includes('type:predefined') && availableTemplates.length > 0 && (
                      <Collapsible
                        open={!isCollapsed('type:predefined')}
                        onOpenChange={() => toggleCollapsed('type:predefined')}
                      >
                        <div className="border border-border/50 rounded-lg overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <div
                              className="flex items-center gap-3 px-3 py-2 bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors"
                            >
                              {isCollapsed('type:predefined') ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">On-Demand</span>
                              <div className="ml-auto flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                  0/0
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                  {availableTemplates.length} available
                                </Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-3">
                              <div className="text-xs text-muted-foreground mb-2 font-medium">
                                Available Templates
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 lg:gap-3">
                                {availableTemplates.map((template) => (
                                  <TemplateCard
                                    key={template.name}
                                    template={template}
                                    onInstall={handleInstallTemplate}
                                    isInstalling={installing === template.name}
                                  />
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )}

                    {/* Render custom groups */}
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
                  </>
                );
              })()}

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agent Templates</DialogTitle>
            <DialogDescription>
              Choose a template to quickly create a new agent
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-4">
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
            <DialogTitle>Create Agent</DialogTitle>
            <DialogDescription>
              Create a new automation agent
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
