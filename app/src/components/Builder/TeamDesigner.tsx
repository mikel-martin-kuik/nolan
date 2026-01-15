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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users, Plus, Settings, Trash2, X, Save, Building2 } from 'lucide-react';
import type { TeamConfig, AgentConfig, DepartmentsConfig, Department } from '../../types';

export function TeamDesigner() {
  const { loadAvailableTeams, loadTeam, currentTeamName, availableTeams, currentTeam: teamConfig } = useTeamStore();
  const { loadDepartments, saveDepartments, departments } = useDepartmentStore();
  const { success, error: showError } = useToastStore();
  const context = useNavigationStore((state) => state.context);
  const clearContext = useNavigationStore((state) => state.clearContext);

  const [saving, setSaving] = useState(false);

  // Create team modal
  const [createTeamModal, setCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamFirstAgent, setNewTeamFirstAgent] = useState('');
  const [newTeamFirstAgentRole, setNewTeamFirstAgentRole] = useState('');
  const [newTeamFirstAgentModel, setNewTeamFirstAgentModel] = useState('sonnet');

  // Team settings modal
  const [teamSettingsModal, setTeamSettingsModal] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState('');
  const [editedTeamDescription, setEditedTeamDescription] = useState('');

  // Agent config modal
  const [agentConfigModal, setAgentConfigModal] = useState<{ agent: AgentConfig; index: number } | null>(null);
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);

  // Add agent modal
  const [addAgentModal, setAddAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');
  const [newAgentModel, setNewAgentModel] = useState('sonnet');

  // Note-taker and exception handler modals
  const [noteTakerModal, setNoteTakerModal] = useState(false);
  const [editedNoteTaker, setEditedNoteTaker] = useState('');
  const [exceptionHandlerModal, setExceptionHandlerModal] = useState(false);
  const [editedExceptionHandler, setEditedExceptionHandler] = useState('');

  // Departments modal
  const [departmentsModal, setDepartmentsModal] = useState(false);
  const [editedDepartments, setEditedDepartments] = useState<(Department & { _editIndex: number })[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  // Delete confirmation
  const [deleteTeamName, setDeleteTeamName] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; teamName: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef('team-designer-card-menu');

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, teamName: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('team-designer-card-menu-open', { detail: menuId.current }));
    setContextMenu({ x: e.clientX, y: e.clientY, teamName });
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
    window.addEventListener('team-designer-card-menu-open', handleOtherMenuOpen);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('team-designer-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  // Agent context menu state
  const [agentContextMenu, setAgentContextMenu] = useState<{ x: number; y: number; agent: AgentConfig; index: number } | null>(null);
  const agentContextMenuRef = useRef<HTMLDivElement>(null);
  const agentMenuId = useRef('team-designer-agent-menu');

  // Handle right-click agent context menu
  const handleAgentContextMenu = (e: React.MouseEvent, agent: AgentConfig, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('team-designer-agent-menu-open', { detail: agentMenuId.current }));
    setAgentContextMenu({ x: e.clientX, y: e.clientY, agent, index });
  };

  // Handle click outside to close agent context menu
  const handleAgentClickOutside = useCallback((e: MouseEvent) => {
    if (agentContextMenuRef.current && !agentContextMenuRef.current.contains(e.target as Node)) {
      setAgentContextMenu(null);
    }
  }, []);

  // Handle other agent menu opening (close this one)
  const handleOtherAgentMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== agentMenuId.current) {
      setAgentContextMenu(null);
    }
  }, []);

  // Close agent context menu when clicking outside
  useEffect(() => {
    if (!agentContextMenu) return;
    document.addEventListener('click', handleAgentClickOutside);
    window.addEventListener('team-designer-agent-menu-open', handleOtherAgentMenuOpen);
    return () => {
      document.removeEventListener('click', handleAgentClickOutside);
      window.removeEventListener('team-designer-agent-menu-open', handleOtherAgentMenuOpen);
    };
  }, [agentContextMenu, handleAgentClickOutside, handleOtherAgentMenuOpen]);

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
  // Delete team handler (from context menu)
  const handleDeleteTeam = async (teamName: string) => {
    setSaving(true);
    try {
      await invoke('delete_team', { team_name: teamName });
      await loadAvailableTeams();
      if (currentTeamName === teamName) {
        // Load another team if the deleted one was selected
        const remaining = availableTeams.filter(t => t !== teamName);
        if (remaining.length > 0) {
          loadTeam(remaining[0]);
        }
      }
      success(`Team '${teamName}' deleted`);
    } catch (err) {
      showError(`Failed to delete team: ${err}`);
    } finally {
      setSaving(false);
      setDeleteTeamName(null);
    }
  };

  // Initiate delete (opens confirmation dialog)
  const initiateDeleteTeam = (teamName: string) => {
    setContextMenu(null);
    if (teamName === 'default') {
      showError('Cannot delete the default team');
      return;
    }
    setDeleteTeamName(teamName);
  };

  // Settings from context menu
  const handleSettingsFromMenu = () => {
    if (!contextMenu) return;
    const teamName = contextMenu.teamName;
    setContextMenu(null);
    // Load and open settings for this team
    if (currentTeamName !== teamName) {
      loadTeam(teamName);
    }
    // Small delay to ensure team is loaded before opening settings
    setTimeout(() => {
      handleOpenTeamSettings();
    }, 100);
  };

  const saveTeamConfigHelper = async (config: TeamConfig, teamName?: string) => {
    setSaving(true);
    try {
      const name = teamName || config.team.name;

      // Handle rename if needed
      if (teamName && teamName !== config.team.name) {
        await invoke('rename_team_config', { old_name: config.team.name, new_name: teamName });
        config = { ...config, team: { ...config.team, name: teamName } };
      }

      await invoke('save_team_config', { team_name: name, config });
      await loadAvailableTeams();
      await loadTeam(name);
      success('Team saved successfully');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Create team handlers
  const handleOpenCreateTeam = () => {
    setNewTeamName('');
    setNewTeamDescription('');
    setNewTeamFirstAgent('');
    setNewTeamFirstAgentRole('');
    setNewTeamFirstAgentModel('sonnet');
    setCreateTeamModal(true);
  };

  const createNewTeam = async () => {
    if (!newTeamName) {
      showError('Team name is required');
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(newTeamName)) {
      showError('Team name must start with lowercase letter, contain only lowercase letters, numbers, and underscores');
      return;
    }
    if (!newTeamFirstAgent) {
      showError('Agent name is required');
      return;
    }
    if (!newTeamFirstAgentRole) {
      showError('Agent role is required');
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
            phases: [{
              name: 'Initial Phase',
              owner: newTeamFirstAgent,
              output: 'output.md',
              requires: [],
            }],
          },
        },
      };

      await invoke('save_team_config', { team_name: newTeamName, config: newConfig });
      await loadAvailableTeams();
      await loadTeam(newTeamName);
      setCreateTeamModal(false);
      success(`Team '${newTeamName}' created`);
    } catch (err) {
      showError(`Failed to create team: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Team settings handlers
  const handleOpenTeamSettings = () => {
    if (!teamConfig) return;
    setEditedTeamName(teamConfig.team.name);
    setEditedTeamDescription(teamConfig.team.description || '');
    setTeamSettingsModal(true);
  };

  const saveTeamSettings = async () => {
    if (!teamConfig || !editedTeamName) return;

    if (!/^[a-z][a-z0-9_]*$/.test(editedTeamName)) {
      showError('Team name must start with lowercase letter, contain only lowercase letters, numbers, and underscores');
      return;
    }

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        name: editedTeamName,
        description: editedTeamDescription || undefined
      }
    };

    await saveTeamConfigHelper(newConfig, editedTeamName);
    setTeamSettingsModal(false);
  };

  // Agent config handlers
  const handleEditAgent = (agent: AgentConfig, index: number) => {
    setAgentContextMenu(null);
    setAgentConfigModal({ agent, index });
    setEditedAgent({ ...agent });
  };

  const saveAgentConfig = async () => {
    if (!teamConfig || !editedAgent || agentConfigModal === null) return;

    const newAgents = [...teamConfig.team.agents];
    newAgents[agentConfigModal.index] = editedAgent;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: { ...teamConfig.team, agents: newAgents }
    };

    await saveTeamConfigHelper(newConfig);
    setAgentConfigModal(null);
    setEditedAgent(null);
  };

  const handleRemoveAgentFromTeam = async (agentName: string) => {
    setAgentContextMenu(null);
    if (!teamConfig) return;

    const newAgents = teamConfig.team.agents.filter(a => a.name !== agentName);
    if (newAgents.length === 0) {
      showError('Team must have at least one agent');
      return;
    }

    // Update note_taker if removed
    let newNoteTaker = teamConfig.team.workflow.note_taker;
    if (newNoteTaker === agentName) {
      newNoteTaker = newAgents[0].name;
    }

    // Update phase owners if removed
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

  // Add agent handlers
  const handleOpenAddAgent = () => {
    setNewAgentName('');
    setNewAgentRole('');
    setNewAgentModel('sonnet');
    setAddAgentModal(true);
  };

  const addAgentToTeam = async () => {
    if (!teamConfig || !newAgentName || !newAgentRole) return;

    const newAgent: AgentConfig = {
      name: newAgentName,
      role: newAgentRole,
      model: newAgentModel,
      output_file: null,
      required_sections: [],
      file_permissions: 'restricted',
      workflow_participant: true,
    };

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        agents: [...teamConfig.team.agents, newAgent]
      }
    };

    await saveTeamConfigHelper(newConfig);
    setAddAgentModal(false);
    setNewAgentName('');
  };

  // Note-taker handlers
  const handleOpenNoteTaker = () => {
    if (!teamConfig) return;
    setEditedNoteTaker(teamConfig.team.workflow.note_taker || '');
    setNoteTakerModal(true);
  };

  const saveNoteTaker = async () => {
    if (!teamConfig) return;

    const noteTakerValue = editedNoteTaker && editedNoteTaker !== '__none__' ? editedNoteTaker : undefined;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, note_taker: noteTakerValue }
      }
    };

    await saveTeamConfigHelper(newConfig);
    setNoteTakerModal(false);
  };

  // Exception handler handlers
  const handleOpenExceptionHandler = () => {
    if (!teamConfig) return;
    setEditedExceptionHandler(teamConfig.team.workflow.exception_handler || '');
    setExceptionHandlerModal(true);
  };

  const saveExceptionHandler = async () => {
    if (!teamConfig) return;

    const handlerValue = editedExceptionHandler && editedExceptionHandler !== '__none__' ? editedExceptionHandler : undefined;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, exception_handler: handlerValue }
      }
    };

    await saveTeamConfigHelper(newConfig);
    setExceptionHandlerModal(false);
  };

  // Departments handlers
  const handleOpenDepartments = () => {
    const depts = (departments?.departments || []).map((d, i) => ({
      ...d,
      teams: d.teams || [],
      _editIndex: i,
    }));
    setEditedDepartments(depts);
    setNewDepartmentName('');
    setDepartmentsModal(true);
  };

  const saveDepartmentsConfig = async () => {
    setSaving(true);
    try {
      const config: DepartmentsConfig = {
        departments: editedDepartments.map(d => ({
          name: d.name,
          code: d.code,
          directory: d.directory,
          teams: d.teams,
          pillar: d.pillar,
          parent: d.parent,
          description: d.description,
          notes: d.notes,
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
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team Designer</h2>
          <p className="text-sm text-muted-foreground">Create and configure teams and their agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenDepartments}>
            <Building2 className="w-4 h-4 mr-1" />
            Departments
          </Button>
          <Button size="sm" onClick={handleOpenCreateTeam}>
            <Plus className="w-4 h-4 mr-1" />
            New Team
          </Button>
        </div>
      </div>

      {/* Team List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {availableTeams.map((teamName) => (
          <Card
            key={teamName}
            className={`cursor-pointer transition-colors ${currentTeamName === teamName ? 'border-primary' : 'hover:border-primary/50'}`}
            onClick={() => loadTeam(teamName)}
            onContextMenu={(e) => handleContextMenu(e, teamName)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{teamName}</CardTitle>
                {currentTeamName === teamName && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">Selected</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                {teamConfig && currentTeamName === teamName
                  ? `${teamConfig.team.agents.length} agents`
                  : 'Click to load'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected Team Details */}
      {teamConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {teamConfig.team.name}
            </CardTitle>
            {teamConfig.team.description && (
              <CardDescription>{teamConfig.team.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Team Roles */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Note-taker:</span>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={handleOpenNoteTaker}>
                  {teamConfig.team.workflow.note_taker || 'None'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Guardian:</span>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={handleOpenExceptionHandler}>
                  {teamConfig.team.workflow.exception_handler || 'None'}
                </Button>
              </div>
            </div>

            {/* Agents List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Agents</h4>
                <Button variant="outline" size="sm" onClick={handleOpenAddAgent}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Agent
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {teamConfig.team.agents.map((agent, index) => (
                  <div
                    key={agent.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border cursor-context-menu hover:border-primary/50 transition-colors"
                    onContextMenu={(e) => handleAgentContextMenu(e, agent, index)}
                  >
                    <div>
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{agent.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Team Modal */}
      <Dialog open={createTeamModal} onOpenChange={setCreateTeamModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="my_new_team"
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
              <Input
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="Team description..."
              />
            </div>

            <div className="border-t border-border pt-4">
              <label className="block text-sm font-medium text-foreground mb-3">First Agent</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Name</label>
                  <Input
                    value={newTeamFirstAgent}
                    onChange={(e) => setNewTeamFirstAgent(e.target.value.toLowerCase())}
                    placeholder="agent_name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Role</label>
                    <Input
                      value={newTeamFirstAgentRole}
                      onChange={(e) => setNewTeamFirstAgentRole(e.target.value)}
                      placeholder="Research"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Model</label>
                    <Select value={newTeamFirstAgentModel} onValueChange={setNewTeamFirstAgentModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setCreateTeamModal(false)}>Cancel</Button>
            <Button onClick={createNewTeam} disabled={saving || !newTeamName || !newTeamFirstAgent || !newTeamFirstAgentRole}>
              <Plus className="w-4 h-4 mr-1" />
              {saving ? 'Creating...' : 'Create Team'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Team Settings Modal */}
      <Dialog open={teamSettingsModal} onOpenChange={setTeamSettingsModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Team Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
              <Input
                value={editedTeamName}
                onChange={(e) => setEditedTeamName(e.target.value)}
                placeholder="my_team"
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <Input
                value={editedTeamDescription}
                onChange={(e) => setEditedTeamDescription(e.target.value)}
                placeholder="Team description..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setTeamSettingsModal(false)}>Cancel</Button>
            <Button onClick={saveTeamSettings} disabled={saving || !editedTeamName}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Config Modal */}
      <Dialog open={!!(agentConfigModal && editedAgent)} onOpenChange={(open) => !open && setAgentConfigModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">{editedAgent?.name} Settings</DialogTitle>
          </DialogHeader>

          {editedAgent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                  <Input
                    value={editedAgent.role}
                    onChange={(e) => setEditedAgent({ ...editedAgent, role: e.target.value })}
                    placeholder="Research"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Model</label>
                  <Select
                    value={editedAgent.model}
                    onValueChange={(value) => setEditedAgent({ ...editedAgent, model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opus">Opus</SelectItem>
                      <SelectItem value="sonnet">Sonnet</SelectItem>
                      <SelectItem value="haiku">Haiku</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Output File</label>
                <Input
                  value={editedAgent.output_file || ''}
                  onChange={(e) => setEditedAgent({ ...editedAgent, output_file: e.target.value || null })}
                  placeholder="output.md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">File Permissions</label>
                <Select
                  value={editedAgent.file_permissions}
                  onValueChange={(value) => setEditedAgent({ ...editedAgent, file_permissions: value as AgentConfig['file_permissions'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="permissive">Permissive</SelectItem>
                    <SelectItem value="no_projects">No Projects</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={editedAgent.workflow_participant}
                    onCheckedChange={(checked) => setEditedAgent({ ...editedAgent, workflow_participant: !!checked })}
                  />
                  <span>Workflow Participant</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={editedAgent.awaits_qa || false}
                    onCheckedChange={(checked) => setEditedAgent({ ...editedAgent, awaits_qa: !!checked })}
                  />
                  <span>Awaits QA</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setAgentConfigModal(null)}>Cancel</Button>
            <Button onClick={saveAgentConfig} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Agent Modal */}
      <Dialog open={addAgentModal} onOpenChange={setAddAgentModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Team Agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <Input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value.toLowerCase())}
                placeholder="agent_name"
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Role</label>
              <Input
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
                placeholder="Research, Planning, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Model</label>
              <Select value={newAgentModel} onValueChange={setNewAgentModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opus">Opus</SelectItem>
                  <SelectItem value="sonnet">Sonnet</SelectItem>
                  <SelectItem value="haiku">Haiku</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setAddAgentModal(false)}>Cancel</Button>
            <Button onClick={addAgentToTeam} disabled={saving || !newAgentName || !newAgentRole}>
              <Plus className="w-4 h-4 mr-1" />
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note-taker Modal */}
      <Dialog open={noteTakerModal} onOpenChange={setNoteTakerModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Note-taker</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            The note-taker documents workflow progress and maintains project notes.
          </p>

          <Select value={editedNoteTaker || '__none__'} onValueChange={setEditedNoteTaker}>
            <SelectTrigger>
              <SelectValue placeholder="Select note-taker (optional)..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {teamConfig?.team.agents.map((agent) => (
                <SelectItem key={agent.name} value={agent.name}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setNoteTakerModal(false)}>Cancel</Button>
            <Button onClick={saveNoteTaker} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exception Handler Modal */}
      <Dialog open={exceptionHandlerModal} onOpenChange={setExceptionHandlerModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Guardian</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            The guardian handles workflow exceptions and escalates issues when needed.
          </p>

          <Select value={editedExceptionHandler || '__none__'} onValueChange={setEditedExceptionHandler}>
            <SelectTrigger>
              <SelectValue placeholder="Select guardian (optional)..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {teamConfig?.team.agents.map((agent) => (
                <SelectItem key={agent.name} value={agent.name}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setExceptionHandlerModal(false)}>Cancel</Button>
            <Button onClick={saveExceptionHandler} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
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
            {/* Add new department */}
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
                    setEditedDepartments([...editedDepartments, {
                      name: newDepartmentName,
                      teams: [],
                      _editIndex: editedDepartments.length,
                    }]);
                    setNewDepartmentName('');
                  }
                }}
                disabled={!newDepartmentName}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Existing departments */}
            {editedDepartments.map((dept, index) => (
              <div key={dept._editIndex} className="p-3 rounded-lg bg-secondary/30 border border-border">
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
                    onClick={() => {
                      setEditedDepartments(editedDepartments.filter((_, i) => i !== index));
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dept.teams.length} team{dept.teams.length !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setDepartmentsModal(false)}>Cancel</Button>
            <Button onClick={saveDepartmentsConfig} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Context Menu */}
      {agentContextMenu && teamConfig && (
        <div
          ref={agentContextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${agentContextMenu.x}px`,
            top: `${agentContextMenu.y}px`,
          }}
        >
          <button
            onClick={() => handleEditAgent(agentContextMenu.agent, agentContextMenu.index)}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
          >
            <Settings className="w-4 h-4" />
            Edit Agent
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => handleRemoveAgentFromTeam(agentContextMenu.agent.name)}
            disabled={teamConfig.team.agents.length <= 1}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Remove Agent
          </button>
        </div>
      )}

      {/* Team Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={handleSettingsFromMenu}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left"
          >
            <Settings className="w-4 h-4" />
            Team Settings
          </button>
          <button
            onClick={() => initiateDeleteTeam(contextMenu.teamName)}
            disabled={contextMenu.teamName === 'default'}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete Team
          </button>
        </div>
      )}

      {/* Delete Team Confirmation */}
      <AlertDialog open={!!deleteTeamName} onOpenChange={(open) => !open && setDeleteTeamName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete team "{deleteTeamName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTeamName && handleDeleteTeam(deleteTeamName)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
