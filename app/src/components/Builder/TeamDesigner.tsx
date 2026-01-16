import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@/lib/api';
import { useTeamStore } from '../../store/teamStore';
import { useDepartmentStore } from '../../store/departmentStore';
import { useToastStore } from '../../store/toastStore';
import { useNavigationStore } from '../../store/navigationStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Plus, Settings, Trash2, X, Save, Building2, Layers, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { createPortal } from 'react-dom';
import type { TeamConfig, AgentConfig, DepartmentsConfig, Department, PhaseConfig } from '../../types';

type EditMode = 'none' | 'team' | 'agent' | 'phase' | 'note-taker' | 'guardian';

export function TeamDesigner() {
  const { loadAvailableTeams, loadTeam, currentTeamName, availableTeams, currentTeam: teamConfig } = useTeamStore();
  const { loadDepartments, saveDepartments, departments } = useDepartmentStore();
  const { success, error: showError } = useToastStore();
  const context = useNavigationStore((state) => state.context);
  const clearContext = useNavigationStore((state) => state.clearContext);

  const [saving, setSaving] = useState(false);

  // Unified edit mode - only one thing editable at a time
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // Edited copies
  const [editedTeam, setEditedTeam] = useState<{ name: string; description: string } | null>(null);
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);
  const [editedPhase, setEditedPhase] = useState<PhaseConfig | null>(null);
  const [editedNoteTaker, setEditedNoteTaker] = useState<string>('');
  const [editedGuardian, setEditedGuardian] = useState<string>('');

  // Create team modal (only modal we keep)
  const [createTeamModal, setCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamFirstAgent, setNewTeamFirstAgent] = useState('');
  const [newTeamFirstAgentRole, setNewTeamFirstAgentRole] = useState('');
  const [newTeamFirstAgentModel, setNewTeamFirstAgentModel] = useState('sonnet');

  // Departments modal
  const [departmentsModal, setDepartmentsModal] = useState(false);
  const [editedDepartments, setEditedDepartments] = useState<(Department & { _editIndex: number })[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  // Delete confirmation
  const [deleteTeamName, setDeleteTeamName] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; teamName: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Ref for click-outside auto-save
  const editContainerRef = useRef<HTMLDivElement>(null);

  // Cancel edit helper
  const cancelEdit = () => {
    setEditMode('none');
    setEditIndex(null);
    setEditedTeam(null);
    setEditedAgent(null);
    setEditedPhase(null);
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, teamName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, teamName });
  };

  // Handle click outside to close context menu
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu, handleClickOutside]);

  // Auto-save on click outside edit container
  useEffect(() => {
    if (editMode === 'none') return;

    const handleEditClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // Ignore clicks inside the edit container
      if (editContainerRef.current && editContainerRef.current.contains(target)) {
        return;
      }

      // Ignore clicks on Radix UI portals (dropdowns, dialogs, etc.)
      const targetElement = target as Element;
      if (targetElement.closest?.('[data-radix-popper-content-wrapper]') ||
          targetElement.closest?.('[data-radix-select-viewport]') ||
          targetElement.closest?.('[role="listbox"]')) {
        return;
      }

      // Trigger auto-save based on current edit mode
      if (editMode === 'team' && editedTeam) {
        saveTeamSettings();
      } else if (editMode === 'agent' && editedAgent) {
        saveAgent();
      } else if (editMode === 'phase' && editedPhase) {
        savePhase();
      } else if (editMode === 'note-taker') {
        saveNoteTaker();
      } else if (editMode === 'guardian') {
        saveGuardian();
      }
    };

    // Use setTimeout to avoid the click that started editing from triggering save
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleEditClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleEditClickOutside);
    };
  }, [editMode, editedTeam, editedAgent, editedPhase, editedNoteTaker, editedGuardian]);

  // Load teams on mount
  useEffect(() => {
    loadAvailableTeams();
    loadDepartments();
  }, [loadAvailableTeams, loadDepartments]);

  // Handle deep-link from context
  useEffect(() => {
    if (context.teamId) {
      loadTeam(context.teamId);
      clearContext();
    }
  }, [context.teamId, loadTeam, clearContext]);

  // Save team config helper
  const saveTeamConfigHelper = async (config: TeamConfig, teamName?: string) => {
    setSaving(true);
    try {
      const name = teamName || config.team.name;
      if (teamName && teamName !== config.team.name) {
        await invoke('rename_team_config', { old_name: config.team.name, new_name: teamName });
        config = { ...config, team: { ...config.team, name: teamName } };
      }
      await invoke('save_team_config', { team_name: name, config });
      await loadAvailableTeams();
      await loadTeam(name);
      success('Saved');
      cancelEdit();
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Delete team handler
  const handleDeleteTeam = async (teamName: string) => {
    setSaving(true);
    try {
      await invoke('delete_team', { team_name: teamName });
      await loadAvailableTeams();
      if (currentTeamName === teamName) {
        const remaining = availableTeams.filter(t => t !== teamName);
        if (remaining.length > 0) loadTeam(remaining[0]);
      }
      success(`Team '${teamName}' deleted`);
    } catch (err) {
      showError(`Failed to delete team: ${err}`);
    } finally {
      setSaving(false);
      setDeleteTeamName(null);
    }
  };

  // Initiate delete
  const initiateDeleteTeam = (teamName: string) => {
    setContextMenu(null);
    if (teamName === 'default') {
      showError('Cannot delete the default team');
      return;
    }
    setDeleteTeamName(teamName);
  };

  // Create team
  const createNewTeam = async () => {
    if (!newTeamName || !/^[a-z][a-z0-9_]*$/.test(newTeamName)) {
      showError('Invalid team name');
      return;
    }
    if (!newTeamFirstAgent || !newTeamFirstAgentRole) {
      showError('Agent name and role are required');
      return;
    }

    setSaving(true);
    try {
      const firstAgent: AgentConfig = {
        name: newTeamFirstAgent,
        role: newTeamFirstAgentRole,
        model: newTeamFirstAgentModel,
        output_file: null,
        required_sections: [],
        file_permissions: 'restricted',
        workflow_participant: true,
      };

      const newConfig: TeamConfig = {
        team: {
          name: newTeamName,
          description: newTeamDescription || undefined,
          version: '1.0.0',
          agents: [firstAgent],
          workflow: {
            note_taker: newTeamFirstAgent,
            exception_handler: newTeamFirstAgent,
            phases: [{ name: 'Initial Phase', owner: newTeamFirstAgent, output: 'output.md', requires: [] }],
          },
        },
      };

      await invoke('save_team_config', { team_name: newTeamName, config: newConfig });
      await loadAvailableTeams();
      await loadTeam(newTeamName);
      setCreateTeamModal(false);
      setNewTeamName('');
      setNewTeamDescription('');
      setNewTeamFirstAgent('');
      setNewTeamFirstAgentRole('');
      success(`Team '${newTeamName}' created`);
    } catch (err) {
      showError(`Failed to create team: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Edit team settings inline
  const startEditTeam = () => {
    if (!teamConfig) return;
    setEditedTeam({ name: teamConfig.team.name, description: teamConfig.team.description || '' });
    setEditMode('team');
    setEditIndex(null);
  };

  const saveTeamSettings = async () => {
    if (!teamConfig || !editedTeam?.name) return;
    if (!/^[a-z][a-z0-9_]*$/.test(editedTeam.name)) {
      showError('Invalid team name');
      return;
    }
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, name: editedTeam.name, description: editedTeam.description || undefined }
    };
    await saveTeamConfigHelper(newConfig, editedTeam.name);
  };

  // Edit agent inline
  const startEditAgent = (agent: AgentConfig, index: number) => {
    setEditedAgent({ ...agent });
    setEditMode('agent');
    setEditIndex(index);
  };

  const saveAgent = async () => {
    if (!teamConfig || !editedAgent || editIndex === null) return;
    const newAgents = [...teamConfig.team.agents];
    newAgents[editIndex] = editedAgent;
    const newConfig: TeamConfig = { ...teamConfig, team: { ...teamConfig.team, agents: newAgents } };
    await saveTeamConfigHelper(newConfig);
  };

  const addAgent = async () => {
    if (!teamConfig) return;
    const name = `agent_${teamConfig.team.agents.length + 1}`;
    const newAgent: AgentConfig = {
      name, role: 'New Role', model: 'sonnet',
      output_file: null, required_sections: [], file_permissions: 'restricted', workflow_participant: true,
    };
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, agents: [...teamConfig.team.agents, newAgent] }
    };
    await saveTeamConfigHelper(newConfig);
    // Start editing the new agent
    setEditedAgent(newAgent);
    setEditMode('agent');
    setEditIndex(teamConfig.team.agents.length);
  };

  const removeAgent = async (agentName: string) => {
    if (!teamConfig) return;
    const newAgents = teamConfig.team.agents.filter(a => a.name !== agentName);
    if (newAgents.length === 0) {
      showError('Team must have at least one agent');
      return;
    }
    let newNoteTaker = teamConfig.team.workflow.note_taker;
    if (newNoteTaker === agentName) newNoteTaker = newAgents[0].name;
    const newPhases = teamConfig.team.workflow.phases.map(p =>
      p.owner === agentName ? { ...p, owner: newAgents[0].name } : p
    );
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        agents: newAgents,
        workflow: { ...teamConfig.team.workflow, note_taker: newNoteTaker, phases: newPhases }
      }
    };
    await saveTeamConfigHelper(newConfig);
  };

  // Edit phase inline
  const startEditPhase = (phase: PhaseConfig, index: number) => {
    setEditedPhase({ ...phase });
    setEditMode('phase');
    setEditIndex(index);
  };

  const savePhase = async () => {
    if (!teamConfig || !editedPhase || editIndex === null) return;
    const newPhases = [...teamConfig.team.workflow.phases];
    newPhases[editIndex] = editedPhase;
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, phases: newPhases } }
    };
    await saveTeamConfigHelper(newConfig);
  };

  const addPhase = async () => {
    if (!teamConfig) return;
    const owner = teamConfig.team.agents[0]?.name || '';
    const newPhase: PhaseConfig = { name: `Phase ${teamConfig.team.workflow.phases.length + 1}`, owner, output: 'output.md', requires: [] };
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, phases: [...teamConfig.team.workflow.phases, newPhase] } }
    };
    await saveTeamConfigHelper(newConfig);
    setEditedPhase(newPhase);
    setEditMode('phase');
    setEditIndex(teamConfig.team.workflow.phases.length);
  };

  const removePhase = async (index: number) => {
    if (!teamConfig) return;
    const newPhases = teamConfig.team.workflow.phases.filter((_, i) => i !== index);
    if (newPhases.length === 0) {
      showError('Team must have at least one phase');
      return;
    }
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, phases: newPhases } }
    };
    await saveTeamConfigHelper(newConfig);
  };

  const movePhase = async (index: number, direction: 'up' | 'down') => {
    if (!teamConfig) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= teamConfig.team.workflow.phases.length) return;
    const newPhases = [...teamConfig.team.workflow.phases];
    [newPhases[index], newPhases[newIndex]] = [newPhases[newIndex], newPhases[index]];
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, phases: newPhases } }
    };
    await saveTeamConfigHelper(newConfig);
  };

  // Edit note-taker/guardian inline
  const startEditNoteTaker = () => {
    if (!teamConfig) return;
    setEditedNoteTaker(teamConfig.team.workflow.note_taker || '__none__');
    setEditMode('note-taker');
  };

  const startEditGuardian = () => {
    if (!teamConfig) return;
    setEditedGuardian(teamConfig.team.workflow.exception_handler || '__none__');
    setEditMode('guardian');
  };

  const saveNoteTaker = async () => {
    if (!teamConfig) return;
    const val = editedNoteTaker && editedNoteTaker !== '__none__' ? editedNoteTaker : undefined;
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, note_taker: val } }
    };
    await saveTeamConfigHelper(newConfig);
  };

  const saveGuardian = async () => {
    if (!teamConfig) return;
    const val = editedGuardian && editedGuardian !== '__none__' ? editedGuardian : undefined;
    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, workflow: { ...teamConfig.team.workflow, exception_handler: val } }
    };
    await saveTeamConfigHelper(newConfig);
  };

  // Departments handlers
  const handleOpenDepartments = () => {
    const depts = (departments?.departments || []).map((d, i) => ({ ...d, teams: d.teams || [], _editIndex: i }));
    setEditedDepartments(depts);
    setNewDepartmentName('');
    setDepartmentsModal(true);
  };

  const saveDepartmentsConfig = async () => {
    setSaving(true);
    try {
      const config: DepartmentsConfig = {
        departments: editedDepartments.map(d => ({
          name: d.name, code: d.code, directory: d.directory, teams: d.teams,
          pillar: d.pillar, parent: d.parent, description: d.description, notes: d.notes,
        })),
      };
      await saveDepartments(config);
      await loadDepartments();
      setDepartmentsModal(false);
      success('Departments saved');
    } catch (err) {
      showError(`Failed to save departments: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team Designer</h2>
          <p className="text-sm text-muted-foreground">Configure teams, agents, and workflow phases</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenDepartments}>
            <Building2 className="w-4 h-4 mr-1" />
            Departments
          </Button>
          <Button size="sm" onClick={() => setCreateTeamModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Team
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0 overflow-hidden">
        {/* Team List - Left Panel */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Teams
              <Badge variant="secondary" className="ml-auto">{availableTeams.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2 space-y-1">
            {availableTeams.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No teams</p>
              </div>
            ) : (
              availableTeams.map((teamName) => (
                <button
                  key={teamName}
                  onClick={() => { cancelEdit(); loadTeam(teamName); }}
                  onContextMenu={(e) => handleContextMenu(e, teamName)}
                  className={`w-full p-2 rounded-lg border text-left transition-colors text-sm ${
                    currentTeamName === teamName
                      ? 'border-muted-foreground/30 bg-muted/50'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className="font-medium">{teamName}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Team Detail - Right Panel */}
        <Card className="md:col-span-3 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-auto p-4">
            {!teamConfig ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a team to edit</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Team Header - Inline Edit */}
                <div className="flex items-start justify-between pb-4 border-b">
                  {editMode === 'team' && editedTeam ? (
                    <div ref={editContainerRef} className="flex-1 space-y-2">
                      <Input
                        value={editedTeam.name}
                        onChange={(e) => setEditedTeam({ ...editedTeam, name: e.target.value })}
                        className="text-lg font-semibold h-8 max-w-xs"
                        placeholder="team_name"
                      />
                      <Input
                        value={editedTeam.description}
                        onChange={(e) => setEditedTeam({ ...editedTeam, description: e.target.value })}
                        className="text-sm h-7"
                        placeholder="Description..."
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{teamConfig.team.name}</h3>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={startEditTeam}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                      {teamConfig.team.description && (
                        <p className="text-sm text-muted-foreground">{teamConfig.team.description}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Workflow Roles */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="text-xs text-muted-foreground mb-1">Note-taker</div>
                    {editMode === 'note-taker' ? (
                      <div ref={editContainerRef} className="flex items-center gap-2">
                        <Select value={editedNoteTaker} onValueChange={setEditedNoteTaker}>
                          <SelectTrigger className="h-7 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {teamConfig.team.agents.map(a => (
                              <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <button onClick={startEditNoteTaker} className="text-sm font-medium hover:underline">
                        {teamConfig.team.workflow.note_taker || 'None'}
                      </button>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="text-xs text-muted-foreground mb-1">Guardian</div>
                    {editMode === 'guardian' ? (
                      <div ref={editContainerRef} className="flex items-center gap-2">
                        <Select value={editedGuardian} onValueChange={setEditedGuardian}>
                          <SelectTrigger className="h-7 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {teamConfig.team.agents.map(a => (
                              <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <button onClick={startEditGuardian} className="text-sm font-medium hover:underline">
                        {teamConfig.team.workflow.exception_handler || 'None'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Agents Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Agents
                      <Badge variant="secondary" className="text-xs">{teamConfig.team.agents.length}</Badge>
                    </h4>
                    <Button variant="outline" size="sm" onClick={addAgent} disabled={saving}>
                      <Plus className="w-3 h-3 mr-1" />Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {teamConfig.team.agents.map((agent, index) => (
                      <div
                        key={agent.name}
                        className={`p-3 rounded-lg border transition-colors ${
                          editMode === 'agent' && editIndex === index ? 'border-muted-foreground/30 bg-muted/50' : 'bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        {editMode === 'agent' && editIndex === index && editedAgent ? (
                          <div ref={editContainerRef} className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <Input
                                value={editedAgent.name}
                                onChange={(e) => setEditedAgent({ ...editedAgent, name: e.target.value.toLowerCase() })}
                                placeholder="name"
                                className="h-8"
                              />
                              <Input
                                value={editedAgent.role}
                                onChange={(e) => setEditedAgent({ ...editedAgent, role: e.target.value })}
                                placeholder="Role"
                                className="h-8"
                              />
                              <Select value={editedAgent.model} onValueChange={(v) => setEditedAgent({ ...editedAgent, model: v })}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="opus">Opus</SelectItem>
                                  <SelectItem value="sonnet">Sonnet</SelectItem>
                                  <SelectItem value="haiku">Haiku</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                value={editedAgent.output_file || ''}
                                onChange={(e) => setEditedAgent({ ...editedAgent, output_file: e.target.value || null })}
                                placeholder="Output file (optional)"
                                className="h-8"
                              />
                              <Select
                                value={editedAgent.file_permissions}
                                onValueChange={(v) => setEditedAgent({ ...editedAgent, file_permissions: v as AgentConfig['file_permissions'] })}
                              >
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="restricted">Restricted</SelectItem>
                                  <SelectItem value="permissive">Permissive</SelectItem>
                                  <SelectItem value="no_projects">No Projects</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={editedAgent.workflow_participant}
                                    onCheckedChange={(c) => setEditedAgent({ ...editedAgent, workflow_participant: !!c })}
                                  />
                                  Workflow
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={editedAgent.awaits_qa || false}
                                    onCheckedChange={(c) => setEditedAgent({ ...editedAgent, awaits_qa: !!c })}
                                  />
                                  Awaits QA
                                </label>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { cancelEdit(); removeAgent(agent.name); }}
                                disabled={teamConfig.team.agents.length <= 1}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => startEditAgent(agent, index)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{agent.name}</span>
                              <span className="text-xs text-muted-foreground">{agent.role}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{agent.model}</Badge>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phases Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Workflow Phases
                      <Badge variant="secondary" className="text-xs">{teamConfig.team.workflow.phases.length}</Badge>
                    </h4>
                    <Button variant="outline" size="sm" onClick={addPhase} disabled={saving}>
                      <Plus className="w-3 h-3 mr-1" />Add
                    </Button>
                  </div>

                  {/* Phase flow */}
                  {teamConfig.team.workflow.phases.length > 0 && (
                    <div className="flex items-center gap-1 py-2 px-2 bg-muted/30 rounded-lg mb-3 overflow-x-auto">
                      {teamConfig.team.workflow.phases.map((phase, index) => (
                        <div key={phase.name} className="flex items-center">
                          <div className="flex flex-col items-center min-w-[50px]">
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </div>
                            <span className="text-[10px] mt-1 truncate max-w-[50px]">{phase.name}</span>
                          </div>
                          {index < teamConfig.team.workflow.phases.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground mx-1 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Phase list */}
                  <div className="space-y-2">
                    {teamConfig.team.workflow.phases.map((phase, index) => (
                      <div
                        key={`${phase.name}-${index}`}
                        className={`p-3 rounded-lg border transition-colors ${
                          editMode === 'phase' && editIndex === index ? 'border-muted-foreground/30 bg-muted/50' : 'bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        {editMode === 'phase' && editIndex === index && editedPhase ? (
                          <div ref={editContainerRef} className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <Input
                                value={editedPhase.name}
                                onChange={(e) => setEditedPhase({ ...editedPhase, name: e.target.value })}
                                placeholder="Phase name"
                                className="h-8"
                              />
                              <Select value={editedPhase.owner} onValueChange={(v) => setEditedPhase({ ...editedPhase, owner: v })}>
                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {teamConfig.team.agents.map(a => (
                                    <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                value={editedPhase.output}
                                onChange={(e) => setEditedPhase({ ...editedPhase, output: e.target.value })}
                                placeholder="output.md"
                                className="h-8"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              {teamConfig.team.workflow.phases.length > 1 && (
                                <div className="flex-1">
                                  <div className="text-xs text-muted-foreground mb-1">Dependencies</div>
                                  <div className="flex flex-wrap gap-2">
                                    {teamConfig.team.workflow.phases
                                      .filter((_, i) => i !== index)
                                      .map((p) => (
                                        <label key={p.name} className="flex items-center gap-1 text-xs">
                                          <Checkbox
                                            checked={(editedPhase.requires || []).includes(p.name)}
                                            onCheckedChange={() => {
                                              const reqs = editedPhase.requires || [];
                                              const newReqs = reqs.includes(p.name)
                                                ? reqs.filter(r => r !== p.name)
                                                : [...reqs, p.name];
                                              setEditedPhase({ ...editedPhase, requires: newReqs });
                                            }}
                                          />
                                          {p.name}
                                        </label>
                                      ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { cancelEdit(); movePhase(index, 'up'); }}
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { cancelEdit(); movePhase(index, 'down'); }}
                                  disabled={index === teamConfig.team.workflow.phases.length - 1}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { cancelEdit(); removePhase(index); }}
                                  disabled={teamConfig.team.workflow.phases.length <= 1}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center cursor-pointer"
                            onClick={() => startEditPhase(phase, index)}
                          >
                            <Badge variant="outline" className="text-xs mr-2">{index + 1}</Badge>
                            <span className="font-medium">{phase.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({phase.owner})</span>
                            <span className="text-xs text-muted-foreground ml-auto">→ {phase.output}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Team Modal - Only modal we keep for initial setup */}
      <Dialog open={createTeamModal} onOpenChange={setCreateTeamModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Team Name</label>
              <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="my_new_team" />
              <p className="text-xs text-muted-foreground mt-1">Lowercase, numbers, underscores</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Input value={newTeamDescription} onChange={(e) => setNewTeamDescription(e.target.value)} placeholder="Optional..." />
            </div>
            <div className="border-t pt-4">
              <label className="block text-sm font-medium mb-3">First Agent</label>
              <div className="space-y-3">
                <Input value={newTeamFirstAgent} onChange={(e) => setNewTeamFirstAgent(e.target.value.toLowerCase())} placeholder="agent_name" />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={newTeamFirstAgentRole} onChange={(e) => setNewTeamFirstAgentRole(e.target.value)} placeholder="Role" />
                  <Select value={newTeamFirstAgentModel} onValueChange={setNewTeamFirstAgentModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opus">Opus</SelectItem>
                      <SelectItem value="sonnet">Sonnet</SelectItem>
                      <SelectItem value="haiku">Haiku</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setCreateTeamModal(false)}>Cancel</Button>
            <Button onClick={createNewTeam} disabled={saving || !newTeamName || !newTeamFirstAgent || !newTeamFirstAgentRole}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Departments Modal */}
      <Dialog open={departmentsModal} onOpenChange={setDepartmentsModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Manage Departments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                placeholder="New department name..."
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (newDepartmentName) {
                    setEditedDepartments([...editedDepartments, { name: newDepartmentName, teams: [], _editIndex: editedDepartments.length }]);
                    setNewDepartmentName('');
                  }
                }}
                disabled={!newDepartmentName}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {editedDepartments.map((dept, index) => (
              <div key={dept._editIndex} className="p-3 rounded-lg bg-secondary/30 border">
                <div className="flex items-center justify-between mb-2">
                  <Input
                    value={dept.name}
                    onChange={(e) => {
                      const newDepts = [...editedDepartments];
                      newDepts[index] = { ...dept, name: e.target.value };
                      setEditedDepartments(newDepts);
                    }}
                    className="font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setEditedDepartments(editedDepartments.filter((_, i) => i !== index))}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{dept.teams.length} team{dept.teams.length !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setDepartmentsModal(false)}>Cancel</Button>
            <Button onClick={saveDepartmentsConfig} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />{saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Team Context Menu */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { setContextMenu(null); loadTeam(contextMenu.teamName); startEditTeam(); }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
          >
            <Settings className="w-4 h-4" />Settings
          </button>
          <button
            onClick={() => initiateDeleteTeam(contextMenu.teamName)}
            disabled={contextMenu.teamName === 'default'}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />Delete
          </button>
        </div>,
        document.body
      )}

      {/* Delete Team Confirmation */}
      <AlertDialog open={!!deleteTeamName} onOpenChange={(open) => !open && setDeleteTeamName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete team "{deleteTeamName}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTeamName && handleDeleteTeam(deleteTeamName)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
