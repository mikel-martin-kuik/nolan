import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { useTeamStore } from '../../store/teamStore';
import { useDepartmentStore } from '../../store/departmentStore';
import { useToastStore } from '../../store/toastStore';
import { Users, Plus, Check, FileText, Trash2, X, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamConfig, AgentConfig, PhaseConfig, AgentDirectoryInfo } from '@/types';

// Context menu types
type ContextMenuType = 'team' | 'agent' | 'phase';
interface ContextMenuState {
  type: ContextMenuType;
  x: number;
  y: number;
  data: string | number; // team name, agent name, or phase index
}

export const TeamsPanel: React.FC = () => {
  const { availableTeams, loadAvailableTeams, loadTeam } = useTeamStore();
  const {
    departments,
    loadDepartments,
    saveDepartments,
    collapsedDepartments,
    toggleDepartmentCollapsed,
    getGroupedTeams,
    // New: pillar grouping
    loadTeamInfos,
    collapsedPillars,
    togglePillarCollapsed,
    getGroupedByPillar,
  } = useDepartmentStore();
  const { success, error: showError } = useToastStore();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null);
  const [agentInfos, setAgentInfos] = useState<AgentDirectoryInfo[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [agentConfigModal, setAgentConfigModal] = useState<{ agent: AgentConfig; index: number } | null>(null);
  const [phaseModal, setPhaseModal] = useState<{ phase: PhaseConfig; index: number } | null>(null);
  const [noteTakerModal, setNoteTakerModal] = useState(false);
  const [exceptionHandlerModal, setExceptionHandlerModal] = useState(false);
  const [addAgentModal, setAddAgentModal] = useState(false);
  const [addPhaseModal, setAddPhaseModal] = useState(false);
  const [teamSettingsModal, setTeamSettingsModal] = useState(false);
  const [createTeamModal, setCreateTeamModal] = useState(false);
  const [departmentsModal, setDepartmentsModal] = useState(false);

  // Edited values for modals
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);
  const [editedPhase, setEditedPhase] = useState<PhaseConfig | null>(null);
  const [editedNoteTaker, setEditedNoteTaker] = useState('');
  const [editedExceptionHandler, setEditedExceptionHandler] = useState('');
  const [newAgentName, setNewAgentName] = useState('');
  const [newPhase, setNewPhase] = useState<PhaseConfig>({ name: '', owner: '', output: '', requires: [], template: '' });
  const [editedTeamName, setEditedTeamName] = useState('');
  const [editedTeamDescription, setEditedTeamDescription] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamFirstAgent, setNewTeamFirstAgent] = useState('');

  // Department editing state (order is derived from array index for internal tracking)
  // We use a local editing type that has _editIndex for identification during editing
  const [editedDepartments, setEditedDepartments] = useState<{
    name: string;
    code?: string;
    directory?: string;
    teams: string[];
    _editIndex: number;  // Internal tracking, not saved to YAML
  }[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  // Saving state
  const [saving, setSaving] = useState(false);

  // Fetch agent directories for role/model info
  const fetchAgentInfos = useCallback(async () => {
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      setAgentInfos(dirs);
    } catch (err) {
      console.error('Failed to load agent info:', err);
    }
  }, []);

  // Get agent info by name
  const getAgentInfo = (name: string) => agentInfos.find(a => a.name === name);

  // Get available agents (not already in team)
  const getAvailableAgentsForAdd = () => {
    if (!teamConfig) return agentInfos.filter(a => !a.name.startsWith('agent-') && a.role && a.model);
    const usedNames = teamConfig.team.agents.map(a => a.name);
    return agentInfos.filter(a => !usedNames.includes(a.name) && !a.name.startsWith('agent-') && a.role && a.model);
  };

  useEffect(() => {
    loadAvailableTeams();
    fetchAgentInfos();
    loadDepartments();
    loadTeamInfos();  // Load hierarchical team info
  }, [loadAvailableTeams, fetchAgentInfos, loadDepartments, loadTeamInfos]);

  // Get teams grouped by department (flat view)
  const departmentGroups = getGroupedTeams(availableTeams);

  // Get teams grouped by pillar (hierarchical view)
  const pillarGroups = getGroupedByPillar();
  const showPillarView = pillarGroups.length > 0 && pillarGroups.some(p => !p.isOther);

  const handleSelectTeam = async (teamName: string) => {
    setSelectedTeam(teamName);
    try {
      await loadTeam(teamName);
      setTeamConfig(useTeamStore.getState().currentTeam);
    } catch (err) {
      showError(`Failed to load team: ${err}`);
    }
  };

  const openCreateTeamModal = () => {
    setNewTeamName('');
    setNewTeamDescription('');
    setNewTeamFirstAgent('');
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
      showError('At least one agent is required');
      return;
    }

    setSaving(true);
    try {
      const firstAgent: AgentConfig = {
        name: newTeamFirstAgent,
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
            phases: [{
              name: 'Initial Phase',
              owner: newTeamFirstAgent,
              output: 'output.md',
              requires: [],
              template: '',
            }],
          },
        },
      };

      await invoke('save_team_config', { teamName: newTeamName, config: newConfig });
      await loadAvailableTeams();
      await handleSelectTeam(newTeamName);
      setCreateTeamModal(false);
      success(`Team '${newTeamName}' created. Add more agents and configure phases below.`);
    } catch (err) {
      showError(`Failed to create team: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Generic context menu handler
  const openContextMenu = (e: React.MouseEvent, type: ContextMenuType, data: string | number) => {
    e.preventDefault();
    e.stopPropagation();

    const menuHeight = type === 'team' ? 100 : 50;
    const viewportHeight = window.innerHeight;
    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenu({ type, x: e.clientX, y: Math.max(8, y), data });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Team actions
  const handleDeleteTeam = async (teamName: string) => {
    if (teamName === 'default') {
      showError('Cannot delete the default team');
      closeContextMenu();
      return;
    }

    try {
      await invoke('delete_team', { teamName });
      if (selectedTeam === teamName) {
        setSelectedTeam(null);
        setTeamConfig(null);
      }
      await loadAvailableTeams();
      success(`Team '${teamName}' deleted successfully`);
    } catch (err) {
      showError(`Failed to delete team: ${err}`);
    } finally {
      closeContextMenu();
    }
  };

  // Save team config helper
  const saveTeamConfig = async (config: TeamConfig, teamName?: string) => {
    setSaving(true);
    try {
      const name = teamName || config.team.name;

      // Handle rename if needed
      if (teamName && teamName !== config.team.name) {
        await invoke('rename_team_config', { oldName: config.team.name, newName: teamName });
        config = { ...config, team: { ...config.team, name: teamName } };
      }

      await invoke('save_team_config', { teamName: name, config });
      await loadAvailableTeams();
      await handleSelectTeam(name);
      success('Team saved successfully');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Agent config modal handlers
  const openAgentConfigModal = (agent: AgentConfig, index: number) => {
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

    await saveTeamConfig(newConfig);
    setAgentConfigModal(null);
    setEditedAgent(null);
  };

  const removeAgentFromTeam = async (agentName: string) => {
    if (!teamConfig) return;
    closeContextMenu();

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

    await saveTeamConfig(newConfig);
  };

  // Add agent handlers
  const openAddAgentModal = () => {
    setNewAgentName('');
    setAddAgentModal(true);
  };

  const addAgentToTeam = async () => {
    if (!teamConfig || !newAgentName) return;

    const newAgent: AgentConfig = {
      name: newAgentName,
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

    await saveTeamConfig(newConfig);
    setAddAgentModal(false);
    setNewAgentName('');
  };

  // Phase modal handlers
  const openPhaseModal = (phase: PhaseConfig, index: number) => {
    setPhaseModal({ phase, index });
    setEditedPhase({ ...phase });
  };

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

    await saveTeamConfig(newConfig);
    setPhaseModal(null);
    setEditedPhase(null);
  };

  const removePhase = async (index: number) => {
    if (!teamConfig) return;
    closeContextMenu();

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

    await saveTeamConfig(newConfig);
  };

  // Add phase handlers
  const openAddPhaseModal = () => {
    setNewPhase({ name: '', owner: teamConfig?.team.agents[0]?.name || '', output: '', requires: [], template: '' });
    setAddPhaseModal(true);
  };

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

    await saveTeamConfig(newConfig);
    setAddPhaseModal(false);
  };

  // Auditor modal handlers
  const openAuditorModal = () => {
    if (!teamConfig) return;
    setEditedNoteTaker(teamConfig.team.workflow.note_taker || '');
    setNoteTakerModal(true);
  };

  const saveNoteTaker = async () => {
    if (!teamConfig) return;

    // Convert "__none__" placeholder back to undefined
    const noteTakerValue = editedNoteTaker && editedNoteTaker !== '__none__' ? editedNoteTaker : undefined;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, note_taker: noteTakerValue }
      }
    };

    await saveTeamConfig(newConfig);
    setNoteTakerModal(false);
  };

  // Exception handler modal handlers
  const openExceptionHandlerModal = () => {
    if (!teamConfig) return;
    setEditedExceptionHandler(teamConfig.team.workflow.exception_handler || '');
    setExceptionHandlerModal(true);
  };

  const saveExceptionHandler = async () => {
    if (!teamConfig) return;

    // Convert "__none__" placeholder back to undefined
    const handlerValue = editedExceptionHandler && editedExceptionHandler !== '__none__' ? editedExceptionHandler : undefined;

    const newConfig: TeamConfig = {
      ...teamConfig,
      team: {
        ...teamConfig.team,
        workflow: { ...teamConfig.team.workflow, exception_handler: handlerValue }
      }
    };

    await saveTeamConfig(newConfig);
    setExceptionHandlerModal(false);
  };

  // Team settings modal handlers
  const openTeamSettingsModal = () => {
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

    await saveTeamConfig(newConfig, editedTeamName);
    setTeamSettingsModal(false);
  };

  // Close context menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      closeContextMenu();
    }
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu, handleClickOutside]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={openCreateTeamModal}>
          New Team
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const depts = (departments?.departments || []).map((d, i) => ({
              name: d.name,
              code: d.code,
              directory: d.directory,
              teams: d.teams || [],
              _editIndex: i,
            }));
            setEditedDepartments(depts);
            setNewDepartmentName('');
            setDepartmentsModal(true);
          }}
        >
          New Department
        </Button>
      </div>

      {/* Team List and Details */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Team List - Fixed Width */}
        <div className="w-[320px] flex flex-col flex-shrink-0 bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Available Teams ({availableTeams.length})
            </h2>
          </div>
          <div className="flex-1 overflow-auto px-2 pb-4 space-y-3">
            {showPillarView ? (
              // Hierarchical pillar view
              pillarGroups.map((pillar) => {
                const isPillarCollapsed = collapsedPillars.includes(pillar.id);

                return (
                  <div key={pillar.id} className="mb-2">
                    {/* Pillar Header */}
                    {!pillar.isOther && (
                      <button
                        onClick={() => togglePillarCollapsed(pillar.id)}
                        className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-secondary/30 rounded-lg transition-colors border-l-2 border-primary/50"
                      >
                        {isPillarCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-primary" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-primary" />
                        )}
                        <span className="text-sm font-semibold text-foreground">
                          {pillar.name}
                        </span>
                        <span className="text-xs text-muted-foreground/60 ml-auto">
                          {pillar.departments.reduce((sum, d) => sum + d.teams.length, 0)}
                        </span>
                      </button>
                    )}

                    {/* Teams within pillar */}
                    {(!isPillarCollapsed || pillar.isOther) && (
                      <div className={pillar.isOther ? '' : 'ml-2 mt-1'}>
                        {pillar.departments.map((dept) => (
                          <div key={dept.name} className="space-y-1">
                            {dept.teams.map((teamName) => (
                              <button
                                key={teamName}
                                onClick={() => handleSelectTeam(teamName)}
                                onContextMenu={(e) => openContextMenu(e, 'team', teamName)}
                                className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center gap-2 ${
                                  selectedTeam === teamName
                                    ? 'bg-primary/10 border border-primary/30 text-foreground'
                                    : 'bg-secondary/30 border border-border hover:bg-secondary/50 text-foreground'
                                }`}
                              >
                                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium text-sm truncate">{teamName}</span>
                                {teamName === 'default' && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">
                                    Default
                                  </Badge>
                                )}
                                {selectedTeam === teamName && (
                                  <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              // Fallback to flat department view (backward compatible)
              departmentGroups.map((group) => {
                const isCollapsed = collapsedDepartments.includes(group.name);

                return (
                  <div key={group.name}>
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDepartmentCollapsed(group.name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary/30 rounded-lg transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {group.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        {group.teams.length}
                      </span>
                    </button>

                    {/* Team List (collapsible) */}
                    {!isCollapsed && (
                      <div className="mt-1 space-y-1">
                        {group.teams.map((teamName) => (
                          <button
                            key={teamName}
                            onClick={() => handleSelectTeam(teamName)}
                            onContextMenu={(e) => openContextMenu(e, 'team', teamName)}
                            className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center gap-2 ${
                              selectedTeam === teamName
                                ? 'bg-primary/10 border border-primary/30 text-foreground'
                                : 'bg-secondary/30 border border-border hover:bg-secondary/50 text-foreground'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{teamName}</span>
                            {teamName === 'default' && (
                              <Badge variant="secondary" className="ml-auto text-[10px]">
                                Default
                              </Badge>
                            )}
                            {selectedTeam === teamName && (
                              <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {availableTeams.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No teams found. Create your first team.
              </p>
            )}
          </div>
        </div>

        {/* Team Details - Flexible */}
        <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border p-6 overflow-auto">
          {teamConfig ? (
            <div>
              {/* Team Header - Clickable */}
              <div
                className="flex items-center justify-between mb-6 pb-4 border-b border-border cursor-pointer group"
                onClick={openTeamSettingsModal}
              >
                <div>
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {teamConfig.team.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {teamConfig.team.description || `${teamConfig.team.agents.length} agents configured`}
                  </p>
                </div>
              </div>

              {/* Agents Grid */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Agents
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teamConfig.team.agents.map((agent, index) => {
                    const info = getAgentInfo(agent.name);
                    return (
                      <div
                        key={agent.name}
                        onClick={() => openAgentConfigModal(agent, index)}
                        onContextMenu={(e) => openContextMenu(e, 'agent', agent.name)}
                        className="p-3 rounded-lg bg-secondary/30 border border-border cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-foreground capitalize group-hover:text-primary transition-colors">
                            {agent.name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{info?.role || 'No role'}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Model: {info?.model || 'unknown'}
                        </p>
                      </div>
                    );
                  })}
                  {/* Add Agent Card */}
                  <div
                    onClick={openAddAgentModal}
                    className="p-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-secondary/20 transition-all flex items-center justify-center min-h-[80px]"
                  >
                    <div className="text-center text-muted-foreground hover:text-primary transition-colors">
                      <Plus className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-xs">Add Agent</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workflow */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Workflow Phases
                  </h3>
                  <Button variant="ghost" size="sm" onClick={openAddPhaseModal} className="h-7 px-2 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    Add Phase
                  </Button>
                </div>
                <div className="space-y-2">
                  {teamConfig.team.workflow.phases.map((phase, index) => (
                    <div
                      key={index}
                      onClick={() => openPhaseModal(phase, index)}
                      onContextMenu={(e) => openContextMenu(e, 'phase', index)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/50 cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-all group"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <span className="font-medium text-foreground group-hover:text-primary transition-colors">{phase.name}</span>
                        <span className="text-muted-foreground mx-2">-</span>
                        <span className="text-sm text-muted-foreground capitalize">{phase.owner}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{phase.output}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workflow Roles - Clickable */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Workflow Roles
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Workflow progression is automated via hooks. These roles handle documentation and exceptions.
                </p>
                <div className="space-y-2">
                  {/* Note-taker */}
                  <div
                    onClick={openAuditorModal}
                    className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/15 transition-all group"
                  >
                    <span className="text-xs text-blue-400 uppercase tracking-wider">Note-taker</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-medium text-foreground capitalize group-hover:text-blue-400 transition-colors">
                        {teamConfig.team.workflow.note_taker || 'Not assigned'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        documents workflow progress
                      </span>
                    </div>
                  </div>

                  {/* Exception Handler */}
                  <div
                    onClick={openExceptionHandlerModal}
                    className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/15 transition-all group"
                  >
                    <span className="text-xs text-amber-400 uppercase tracking-wider">Exception Handler</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-medium text-foreground capitalize group-hover:text-amber-400 transition-colors">
                        {teamConfig.team.workflow.exception_handler || 'Not assigned'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        escalates issues to human
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">Select a team to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu - Rendered via portal */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          {contextMenu.type === 'team' && (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start rounded-none text-destructive hover:text-destructive"
                onClick={() => handleDeleteTeam(contextMenu.data as string)}
                disabled={contextMenu.data === 'default'}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Team
              </Button>
            </>
          )}
          {contextMenu.type === 'agent' && (
            <Button
              variant="ghost"
              className="w-full justify-start rounded-none text-destructive hover:text-destructive"
              onClick={() => removeAgentFromTeam(contextMenu.data as string)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove from Team
            </Button>
          )}
          {contextMenu.type === 'phase' && (
            <Button
              variant="ghost"
              className="w-full justify-start rounded-none text-destructive hover:text-destructive"
              onClick={() => removePhase(contextMenu.data as number)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Phase
            </Button>
          )}
        </div>,
        document.body
      )}

      {/* Agent Config Modal */}
      {agentConfigModal && editedAgent && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setAgentConfigModal(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground capitalize">{editedAgent.name} Settings</h3>
              <Button variant="ghost" size="icon" onClick={() => setAgentConfigModal(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
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

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setAgentConfigModal(null)}>Cancel</Button>
              <Button onClick={saveAgentConfig} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Phase Edit Modal */}
      {phaseModal && editedPhase && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setPhaseModal(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Edit Phase</h3>
              <Button variant="ghost" size="icon" onClick={() => setPhaseModal(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

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
                <label className="block text-sm font-medium text-foreground mb-1">Requires</label>
                <p className="text-xs text-muted-foreground mb-2">Select outputs from earlier phases that this phase depends on</p>
                <div className="space-y-2 p-3 rounded-lg bg-secondary/20 border border-border/50 max-h-32 overflow-auto">
                  {/* Output files from EARLIER phases only (prevents circular deps) */}
                  {teamConfig?.team.workflow.phases
                    .filter((_, i) => phaseModal && i < phaseModal.index)
                    .map((p, i) => (
                      <label key={p.output} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={(editedPhase.requires || []).includes(p.output)}
                          onCheckedChange={(checked) => {
                            const requires = editedPhase.requires || [];
                            setEditedPhase({
                              ...editedPhase,
                              requires: checked
                                ? [...requires, p.output]
                                : requires.filter(r => r !== p.output)
                            });
                          }}
                        />
                        <span className="text-muted-foreground font-mono text-xs">{p.output}</span>
                        <span className="text-muted-foreground/50 text-xs">(Phase {i + 1}: {p.name})</span>
                      </label>
                    ))}
                  {phaseModal && phaseModal.index === 0 && (
                    <p className="text-xs text-muted-foreground/50 italic">First phase - no earlier phase outputs available</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setPhaseModal(null)}>Cancel</Button>
              <Button onClick={savePhaseConfig} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Auditor Modal */}
      {noteTakerModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setNoteTakerModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Select Note-taker</h3>
              <Button variant="ghost" size="icon" onClick={() => setNoteTakerModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
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

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setNoteTakerModal(false)}>Cancel</Button>
              <Button onClick={saveNoteTaker} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Exception Handler Modal */}
      {exceptionHandlerModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setExceptionHandlerModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Select Exception Handler</h3>
              <Button variant="ghost" size="icon" onClick={() => setExceptionHandlerModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              The exception handler monitors for workflow issues and intervenes when needed.
            </p>

            <Select value={editedExceptionHandler || '__none__'} onValueChange={setEditedExceptionHandler}>
              <SelectTrigger>
                <SelectValue placeholder="Select exception handler (optional)..." />
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

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setExceptionHandlerModal(false)}>Cancel</Button>
              <Button onClick={saveExceptionHandler} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Agent Modal */}
      {addAgentModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setAddAgentModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Add Agent to Team</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddAgentModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <Select value={newAgentName} onValueChange={setNewAgentName}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                {getAvailableAgentsForAdd().map((agent) => (
                  <SelectItem key={agent.name} value={agent.name}>
                    {agent.name} ({agent.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {getAvailableAgentsForAdd().length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">No available agents. Create agents in the Agents page first.</p>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setAddAgentModal(false)}>Cancel</Button>
              <Button onClick={addAgentToTeam} disabled={saving || !newAgentName}>
                <Plus className="w-4 h-4 mr-1" />
                {saving ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Phase Modal */}
      {addPhaseModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setAddPhaseModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Add Workflow Phase</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddPhaseModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

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
                <label className="block text-sm font-medium text-foreground mb-1">Requires</label>
                <p className="text-xs text-muted-foreground mb-2">Select outputs from earlier phases that this phase depends on</p>
                <div className="space-y-2 p-3 rounded-lg bg-secondary/20 border border-border/50 max-h-32 overflow-auto">
                  {/* Output files from all existing phases (new phase goes at end) */}
                  {teamConfig?.team.workflow.phases.map((p, i) => (
                    <label key={p.output} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={(newPhase.requires || []).includes(p.output)}
                        onCheckedChange={(checked) => {
                          const requires = newPhase.requires || [];
                          setNewPhase({
                            ...newPhase,
                            requires: checked
                              ? [...requires, p.output]
                              : requires.filter(r => r !== p.output)
                          });
                        }}
                      />
                      <span className="text-muted-foreground font-mono text-xs">{p.output}</span>
                      <span className="text-muted-foreground/50 text-xs">(Phase {i + 1}: {p.name})</span>
                    </label>
                  ))}
                  {(!teamConfig?.team.workflow.phases || teamConfig.team.workflow.phases.length === 0) && (
                    <p className="text-xs text-muted-foreground/50 italic">First phase - no earlier phase outputs available</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setAddPhaseModal(false)}>Cancel</Button>
              <Button onClick={addPhaseToTeam} disabled={saving || !newPhase.name || !newPhase.owner || !newPhase.output}>
                <Plus className="w-4 h-4 mr-1" />
                {saving ? 'Adding...' : 'Add Phase'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Team Settings Modal */}
      {teamSettingsModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setTeamSettingsModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Team Settings</h3>
              <Button variant="ghost" size="icon" onClick={() => setTeamSettingsModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
                <Input
                  value={editedTeamName}
                  onChange={(e) => setEditedTeamName(e.target.value.toLowerCase())}
                  placeholder="my-team"
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

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setTeamSettingsModal(false)}>Cancel</Button>
              <Button onClick={saveTeamSettings} disabled={saving || !editedTeamName}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Team Modal */}
      {createTeamModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setCreateTeamModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Create New Team</h3>
              <Button variant="ghost" size="icon" onClick={() => setCreateTeamModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Team Name</label>
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value.toLowerCase())}
                  placeholder="my-team"
                />
                <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and underscores only</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <Input
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="Team description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">First Agent</label>
                <Select value={newTeamFirstAgent} onValueChange={setNewTeamFirstAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agentInfos
                      .filter(a => !a.name.startsWith('agent-') && a.role && a.model)
                      .map((agent) => (
                        <SelectItem key={agent.name} value={agent.name}>
                          {agent.name} ({agent.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">You can add more agents after creation</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setCreateTeamModal(false)}>Cancel</Button>
              <Button onClick={createNewTeam} disabled={saving || !newTeamName || !newTeamFirstAgent}>
                <Plus className="w-4 h-4 mr-1" />
                {saving ? 'Creating...' : 'Create Team'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Departments Configuration Modal */}
      {departmentsModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setDepartmentsModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Configure Departments</h3>
              <Button variant="ghost" size="icon" onClick={() => setDepartmentsModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Add New Department */}
              <div className="flex gap-2">
                <Input
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="New department name..."
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    if (!newDepartmentName.trim()) return;
                    const maxIndex = editedDepartments.reduce((max, d) => Math.max(max, d._editIndex), 0);
                    setEditedDepartments([
                      ...editedDepartments,
                      { name: newDepartmentName.trim(), teams: [], _editIndex: maxIndex + 1 }
                    ]);
                    setNewDepartmentName('');
                  }}
                  disabled={!newDepartmentName.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {/* Department List */}
              {editedDepartments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No departments configured. Add a department to organize your teams.
                </p>
              ) : (
                <div className="space-y-4">
                  {editedDepartments
                    .sort((a, b) => a._editIndex - b._editIndex)
                    .map((dept, index) => (
                      <div key={dept._editIndex} className="p-4 rounded-lg bg-secondary/20 border border-border">
                        <div className="flex items-center gap-3 mb-3">
                          {/* Order Controls */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                              disabled={index === 0}
                              onClick={() => {
                                const sorted = [...editedDepartments].sort((a, b) => a._editIndex - b._editIndex);
                                if (index > 0) {
                                  const temp = sorted[index]._editIndex;
                                  sorted[index]._editIndex = sorted[index - 1]._editIndex;
                                  sorted[index - 1]._editIndex = temp;
                                  setEditedDepartments([...sorted]);
                                }
                              }}
                            >
                              <ChevronRight className="w-3 h-3 -rotate-90" />
                            </button>
                            <button
                              className="p-0.5 hover:bg-secondary rounded disabled:opacity-30"
                              disabled={index === editedDepartments.length - 1}
                              onClick={() => {
                                const sorted = [...editedDepartments].sort((a, b) => a._editIndex - b._editIndex);
                                if (index < sorted.length - 1) {
                                  const temp = sorted[index]._editIndex;
                                  sorted[index]._editIndex = sorted[index + 1]._editIndex;
                                  sorted[index + 1]._editIndex = temp;
                                  setEditedDepartments([...sorted]);
                                }
                              }}
                            >
                              <ChevronRight className="w-3 h-3 rotate-90" />
                            </button>
                          </div>

                          {/* Department Name */}
                          <Input
                            value={dept.name}
                            onChange={(e) => {
                              const updated = editedDepartments.map(d =>
                                d._editIndex === dept._editIndex ? { ...d, name: e.target.value } : d
                              );
                              setEditedDepartments(updated);
                            }}
                            className="flex-1 font-medium"
                          />

                          {/* Delete Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setEditedDepartments(editedDepartments.filter(d => d._editIndex !== dept._editIndex));
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Team Assignment */}
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-2">
                            Assigned Teams
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {availableTeams.map((teamName) => {
                              const isAssigned = dept.teams.includes(teamName);
                              const isAssignedElsewhere = editedDepartments.some(
                                d => d._editIndex !== dept._editIndex && d.teams.includes(teamName)
                              );
                              return (
                                <button
                                  key={teamName}
                                  onClick={() => {
                                    if (isAssignedElsewhere) {
                                      // Move from other department to this one
                                      const updated = editedDepartments.map(d => ({
                                        ...d,
                                        teams: d._editIndex === dept._editIndex
                                          ? [...d.teams, teamName]
                                          : d.teams.filter(t => t !== teamName)
                                      }));
                                      setEditedDepartments(updated);
                                    } else if (isAssigned) {
                                      // Remove from this department
                                      const updated = editedDepartments.map(d =>
                                        d._editIndex === dept._editIndex
                                          ? { ...d, teams: d.teams.filter(t => t !== teamName) }
                                          : d
                                      );
                                      setEditedDepartments(updated);
                                    } else {
                                      // Add to this department
                                      const updated = editedDepartments.map(d =>
                                        d._editIndex === dept._editIndex
                                          ? { ...d, teams: [...d.teams, teamName] }
                                          : d
                                      );
                                      setEditedDepartments(updated);
                                    }
                                  }}
                                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                                    isAssigned
                                      ? 'bg-primary/20 text-primary border border-primary/30'
                                      : isAssignedElsewhere
                                      ? 'bg-secondary/50 text-muted-foreground border border-border opacity-50 hover:opacity-100'
                                      : 'bg-secondary/30 text-muted-foreground border border-border hover:border-primary/50'
                                  }`}
                                >
                                  {teamName}
                                  {isAssigned && <Check className="w-3 h-3 inline ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Unassigned Teams Info */}
              {editedDepartments.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Teams not assigned to any department will appear in an &quot;Other&quot; section.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-border">
              <Button variant="secondary" onClick={() => setDepartmentsModal(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  setSaving(true);
                  try {
                    // Sort by _editIndex and strip internal fields before saving
                    const toSave = editedDepartments
                      .sort((a, b) => a._editIndex - b._editIndex)
                      .map(({ _editIndex, ...dept }) => dept);
                    await saveDepartments({ departments: toSave });
                    success('Departments saved successfully');
                    setDepartmentsModal(false);
                  } catch (err) {
                    showError(`Failed to save departments: ${err}`);
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
