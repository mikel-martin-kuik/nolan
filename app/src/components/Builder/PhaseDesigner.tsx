import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@/lib/api';
import { useTeamStore } from '../../store/teamStore';
import { useToastStore } from '../../store/toastStore';
import { useNavigationStore } from '../../store/navigationStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Layers, Plus, Settings, Trash2, Save, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { TeamConfig, PhaseConfig } from '../../types';

export function PhaseDesigner() {
  const { loadAvailableTeams, loadTeam, currentTeamName, availableTeams, currentTeam: teamConfig } = useTeamStore();
  const { success, error: showError } = useToastStore();
  const context = useNavigationStore((state) => state.context);
  const clearContext = useNavigationStore((state) => state.clearContext);

  const [saving, setSaving] = useState(false);

  // Phase edit modal
  const [phaseModal, setPhaseModal] = useState<{ phase: PhaseConfig; index: number } | null>(null);
  const [editedPhase, setEditedPhase] = useState<PhaseConfig | null>(null);

  // Add phase modal
  const [addPhaseModal, setAddPhaseModal] = useState(false);
  const [newPhase, setNewPhase] = useState<PhaseConfig>({ name: '', owner: '', output: '', requires: [] });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; phase: PhaseConfig; index: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef('phase-designer-card-menu');

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, phase: PhaseConfig, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('phase-designer-card-menu-open', { detail: menuId.current }));
    setContextMenu({ x: e.clientX, y: e.clientY, phase, index });
  };

  // Handle click outside to close context menu
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  // Handle other menu opening (close this one)
  const handleOtherMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('phase-designer-card-menu-open', handleOtherMenuOpen);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('phase-designer-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  // Load teams on mount
  useEffect(() => {
    loadAvailableTeams();
  }, [loadAvailableTeams]);

  // Handle deep-link from context
  useEffect(() => {
    if (context.phaseId && teamConfig) {
      const index = teamConfig.team.workflow.phases.findIndex(p => p.name === context.phaseId);
      if (index !== -1) {
        const phase = teamConfig.team.workflow.phases[index];
        setPhaseModal({ phase, index });
        setEditedPhase({ ...phase });
      }
      clearContext();
    }
  }, [context.phaseId, teamConfig, clearContext]);

  // Save team config helper
  const saveTeamConfigHelper = async (config: TeamConfig) => {
    setSaving(true);
    try {
      await invoke('save_team_config', { team_name: config.team.name, config });
      await loadAvailableTeams();
      await loadTeam(config.team.name);
      success('Team saved successfully');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Open add phase modal
  const handleOpenAddPhase = useCallback(() => {
    const defaultOwner = teamConfig?.team?.agents?.[0]?.name || '';
    setNewPhase({ name: '', owner: defaultOwner, output: '', requires: [] });
    setAddPhaseModal(true);
  }, [teamConfig]);

  // Edit phase handler
  const handleEditPhase = (phase: PhaseConfig, index: number) => {
    setContextMenu(null);
    setPhaseModal({ phase, index });
    setEditedPhase({ ...phase });
  };

  // Save phase config
  const savePhaseConfig = async () => {
    if (!teamConfig || !editedPhase || phaseModal === null) return;

    const newPhases = [...teamConfig.team.workflow.phases];
    newPhases[phaseModal.index] = editedPhase;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, phases: newPhases }
      }
    };

    await saveTeamConfigHelper(newConfig);
    setPhaseModal(null);
    setEditedPhase(null);
  };

  // Delete phase handler
  const handleDeletePhase = async (index: number) => {
    setContextMenu(null);
    if (!teamConfig?.team?.workflow?.phases) return;

    const newPhases = teamConfig.team.workflow.phases.filter((_, i) => i !== index);
    if (newPhases.length === 0) {
      showError('Team must have at least one phase');
      return;
    }

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, phases: newPhases }
      }
    };

    await saveTeamConfigHelper(newConfig);
  };

  // Add new phase
  const addPhaseToTeam = async () => {
    if (!teamConfig || !newPhase.name || !newPhase.owner || !newPhase.output) {
      showError('Phase name, owner, and output are required');
      return;
    }

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: {
          ...teamConfig.team.workflow,
          phases: [...teamConfig.team.workflow.phases, newPhase]
        }
      }
    };

    await saveTeamConfigHelper(newConfig);
    setAddPhaseModal(false);
  };

  // Move phase up/down
  const movePhase = async (index: number, direction: 'up' | 'down') => {
    setContextMenu(null);
    if (!teamConfig?.team?.workflow?.phases) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= teamConfig.team.workflow.phases.length) return;

    const newPhases = [...teamConfig.team.workflow.phases];
    [newPhases[index], newPhases[newIndex]] = [newPhases[newIndex], newPhases[index]];

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, phases: newPhases }
      }
    };

    await saveTeamConfigHelper(newConfig);
  };

  // Toggle dependency
  const toggleDependency = (depName: string) => {
    if (!editedPhase) return;

    const requires = editedPhase.requires || [];
    const newRequires = requires.includes(depName)
      ? requires.filter(r => r !== depName)
      : [...requires, depName];

    setEditedPhase({ ...editedPhase, requires: newRequires });
  };

  return (
    <div className="space-y-4">
      {/* Header with team selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Phase Designer</h2>
          <p className="text-sm text-muted-foreground">Design workflow phases and dependencies</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={currentTeamName} onValueChange={loadTeam}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select team..." />
            </SelectTrigger>
            <SelectContent>
              {availableTeams.map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleOpenAddPhase} disabled={!teamConfig}>
            <Plus className="w-4 h-4 mr-1" />
            Add Phase
          </Button>
        </div>
      </div>

      {/* Phases List */}
      {teamConfig ? (
        <div className="space-y-4">
          {/* Visual Phase Flow */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="w-5 h-5" />
                Workflow Phases
              </CardTitle>
              <CardDescription>
                Phases execute in order. Right-click for options.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teamConfig.team.workflow.phases.map((phase, index) => (
                  <div key={`${phase.name}-${index}`} className="flex items-center gap-2">
                    {/* Order indicator */}
                    <span className="text-xs text-muted-foreground w-6 text-center">{index + 1}</span>

                    {/* Phase Card */}
                    <div
                      className="flex-1 flex items-center justify-between p-3 rounded-lg bg-secondary/30 border cursor-context-menu hover:border-primary/50 transition-colors"
                      onContextMenu={(e) => handleContextMenu(e, phase, index)}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium">{phase.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Owner: {phase.owner} | Output: {phase.output}
                          </div>
                        </div>
                      </div>

                      {/* Dependencies */}
                      {phase.requires && phase.requires.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>Requires:</span>
                          {phase.requires.map((dep) => (
                            <span key={dep} className="bg-primary/20 px-1.5 py-0.5 rounded">
                              {dep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Arrow to next */}
                    {index < teamConfig.team.workflow.phases.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Dependency Visualization */}
          {teamConfig.team.workflow.phases.some(p => p.requires && p.requires.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dependencies</CardTitle>
                <CardDescription>Phase dependencies and execution order</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {teamConfig.team.workflow.phases.map((phase) => {
                    if (!phase.requires || phase.requires.length === 0) return null;
                    return (
                      <div key={phase.name} className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{phase.name}</span>
                        <span>waits for</span>
                        {phase.requires.map((dep, depIndex) => (
                          <span key={dep}>
                            <span className="font-medium">{dep}</span>
                            {depIndex < phase.requires!.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-40 text-muted-foreground">
            Select a team to view and edit phases
          </CardContent>
        </Card>
      )}

      {/* Context Menu */}
      {contextMenu && teamConfig && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={() => handleEditPhase(contextMenu.phase, contextMenu.index)}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
          >
            <Settings className="w-4 h-4" />
            Edit Phase
          </button>
          <button
            onClick={() => movePhase(contextMenu.index, 'up')}
            disabled={contextMenu.index === 0}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-4 h-4" />
            Move Up
          </button>
          <button
            onClick={() => movePhase(contextMenu.index, 'down')}
            disabled={contextMenu.index >= teamConfig.team.workflow.phases.length - 1}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-4 h-4" />
            Move Down
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => handleDeletePhase(contextMenu.index)}
            disabled={teamConfig.team.workflow.phases.length <= 1}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete Phase
          </button>
        </div>
      )}

      {/* Phase Edit Modal */}
      <Dialog open={!!(phaseModal && editedPhase)} onOpenChange={(open) => !open && setPhaseModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Phase</DialogTitle>
          </DialogHeader>

          {editedPhase && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Phase Name</label>
                <Input
                  value={editedPhase.name}
                  onChange={(e) => setEditedPhase({ ...editedPhase, name: e.target.value })}
                  placeholder="Research"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Owner</label>
                <Select
                  value={editedPhase.owner}
                  onValueChange={(value) => setEditedPhase({ ...editedPhase, owner: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamConfig?.team.agents.map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Output File</label>
                <Input
                  value={editedPhase.output}
                  onChange={(e) => setEditedPhase({ ...editedPhase, output: e.target.value })}
                  placeholder="output.md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Template (optional)</label>
                <Input
                  value={editedPhase.template || ''}
                  onChange={(e) => setEditedPhase({ ...editedPhase, template: e.target.value || undefined })}
                  placeholder="template.md"
                />
              </div>

              {/* Dependencies */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Dependencies</label>
                <div className="flex flex-wrap gap-2">
                  {teamConfig?.team.workflow.phases
                    .filter(p => p.name !== editedPhase.name)
                    .map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => toggleDependency(p.name)}
                        className={`px-2 py-1 text-sm rounded border transition-colors ${
                          (editedPhase.requires || []).includes(p.name)
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
                {teamConfig?.team.workflow.phases.length === 1 && (
                  <p className="text-xs text-muted-foreground mt-1">Add more phases to set dependencies</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setPhaseModal(null)}>Cancel</Button>
            <Button onClick={savePhaseConfig} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Phase Modal */}
      <Dialog open={addPhaseModal} onOpenChange={setAddPhaseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Phase</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Phase Name</label>
              <Input
                value={newPhase.name}
                onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })}
                placeholder="Research"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Owner</label>
              <Select
                value={newPhase.owner}
                onValueChange={(value) => setNewPhase({ ...newPhase, owner: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner..." />
                </SelectTrigger>
                <SelectContent>
                  {teamConfig?.team.agents.map((agent) => (
                    <SelectItem key={agent.name} value={agent.name}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Output File</label>
              <Input
                value={newPhase.output}
                onChange={(e) => setNewPhase({ ...newPhase, output: e.target.value })}
                placeholder="output.md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Template (optional)</label>
              <Input
                value={newPhase.template || ''}
                onChange={(e) => setNewPhase({ ...newPhase, template: e.target.value || undefined })}
                placeholder="template.md"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setAddPhaseModal(false)}>Cancel</Button>
            <Button onClick={addPhaseToTeam} disabled={saving || !newPhase.name || !newPhase.owner || !newPhase.output}>
              <Plus className="w-4 h-4 mr-1" />
              {saving ? 'Adding...' : 'Add Phase'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
