import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useTeamStore } from '../../store/teamStore';
import { useDepartmentStore } from '../../store/departmentStore';
import { useAgentStore } from '../../store/agentStore';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { useToastStore } from '../../store/toastStore';
import { TeamWorkflowDag } from './TeamWorkflowDag';
import { TeamSelector } from './TeamSelector';
import { TeamHistoryTab } from './TeamHistoryTab';
import { ImplementationPipelineList } from './ImplementationPipelineList';
import { ImplementationPipelineDetail } from './ImplementationPipelineDetail';
import { WorktreeStatusEnhanced } from './WorktreeStatusEnhanced';
import { ProjectSelectModal, LaunchParams } from '../shared/ProjectSelectModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { RefreshCw, GitBranch, GitPullRequest, FolderGit, ChevronLeft, X, Save, Plus, Play, History, Rocket, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowViewMode } from '../../types/workflow';
import type { TeamWorkflowSubTab } from '../../store/workflowVisualizerStore';
import type { PhaseConfig, TeamConfig, AgentConfig, AgentDirectoryInfo, DepartmentsConfig, Department } from '../../types';
import type { ProjectInfo } from '../../types/projects';

export function WorkflowVisualizerPanel() {
  const viewMode = useWorkflowVisualizerStore((state) => state.viewMode);
  const setViewMode = useWorkflowVisualizerStore((state) => state.setViewMode);
  const teamWorkflowSubTab = useWorkflowVisualizerStore((state) => state.teamWorkflowSubTab);
  const setTeamWorkflowSubTab = useWorkflowVisualizerStore((state) => state.setTeamWorkflowSubTab);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const { refetch, isLoading, teamConfig } = useWorkflowData();
  const { loadAvailableTeams, loadTeam, currentTeamName } = useTeamStore();
  const { loadDepartments, saveDepartments, departments } = useDepartmentStore();
  const { launchTeam, killTeam, loading: agentLoading, teamAgents, updateStatus: updateAgentStatus } = useAgentStore();
  const { success, error: showError } = useToastStore();

  // Launch modal state
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Check if current team is running (any agent in team is active)
  const isTeamRunning = teamAgents.some(a => a.team === currentTeamName && a.active);

  // Mobile: track whether to show pipeline detail (vs pipeline list)
  const [showMobilePipelineDetail, setShowMobilePipelineDetail] = useState(false);

  // Agent directory info for role/model display
  const [agentInfos, setAgentInfos] = useState<AgentDirectoryInfo[]>([]);

  // Modal states
  const [phaseModal, setPhaseModal] = useState<{ phase: PhaseConfig; index: number } | null>(null);
  const [editedPhase, setEditedPhase] = useState<PhaseConfig | null>(null);
  const [addPhaseModal, setAddPhaseModal] = useState(false);
  const [newPhase, setNewPhase] = useState<PhaseConfig>({ name: '', owner: '', output: '', requires: [] });
  const [saving, setSaving] = useState(false);

  // Agent config modal
  const [agentConfigModal, setAgentConfigModal] = useState<{ agent: AgentConfig; index: number } | null>(null);
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);

  // Note-taker and exception handler modals
  const [noteTakerModal, setNoteTakerModal] = useState(false);
  const [editedNoteTaker, setEditedNoteTaker] = useState('');
  const [exceptionHandlerModal, setExceptionHandlerModal] = useState(false);
  const [editedExceptionHandler, setEditedExceptionHandler] = useState('');

  // Add agent modal
  const [addAgentModal, setAddAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  // Team settings modal
  const [teamSettingsModal, setTeamSettingsModal] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState('');
  const [editedTeamDescription, setEditedTeamDescription] = useState('');

  // Create team modal
  const [createTeamModal, setCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamFirstAgent, setNewTeamFirstAgent] = useState('');

  // Departments modal
  const [departmentsModal, setDepartmentsModal] = useState(false);
  const [editedDepartments, setEditedDepartments] = useState<(Department & { _editIndex: number })[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  // Fetch agent directories
  const fetchAgentInfos = useCallback(async () => {
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      setAgentInfos(dirs);
    } catch (err) {
      console.error('Failed to load agent info:', err);
    }
  }, []);

  useEffect(() => {
    fetchAgentInfos();
  }, [fetchAgentInfos]);

  // Fetch projects when launch modal opens
  const fetchProjects = useCallback(async () => {
    try {
      const projectList = await invoke<ProjectInfo[]>('list_projects');
      setProjects(projectList);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, []);

  useEffect(() => {
    if (launchModalOpen) {
      fetchProjects();
    }
  }, [launchModalOpen, fetchProjects]);

  // Update agent status periodically to check if team is running
  useEffect(() => {
    updateAgentStatus();
    const interval = setInterval(updateAgentStatus, 5000);
    return () => clearInterval(interval);
  }, [updateAgentStatus]);

  // Launch team handler
  const handleLaunchTeam = async (params: LaunchParams) => {
    if (!currentTeamName) return;

    setIsLaunching(true);
    try {
      await launchTeam(
        currentTeamName,
        params.projectName,
        params.initialPrompt,
        params.updatedOriginalPrompt,
        params.followupPrompt
      );
      setLaunchModalOpen(false);
      await updateAgentStatus();
    } catch (err) {
      showError(`Failed to launch team: ${err}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // Kill team handler
  const handleKillTeam = async () => {
    if (!currentTeamName) return;

    try {
      await killTeam(currentTeamName);
      await updateAgentStatus();
    } catch (err) {
      showError(`Failed to kill team: ${err}`);
    }
  };

  // Filter eligible agents (not ephemeral, has role/model)
  const isTeamEligibleAgent = (a: AgentDirectoryInfo) => {
    if (!a.role || !a.model) return false;
    const excludedPrefixes = ['agent-', 'cron-', 'pred-'];
    return !excludedPrefixes.some(prefix => a.name.startsWith(prefix));
  };

  const getAvailableAgentsForAdd = () => {
    if (!teamConfig) return agentInfos.filter(isTeamEligibleAgent);
    const usedNames = teamConfig.team.agents.map(a => a.name);
    return agentInfos.filter(a => !usedNames.includes(a.name) && isTeamEligibleAgent(a));
  };

  // When pipeline is selected on mobile, show detail view
  const handlePipelineSelect = () => {
    if (selectedPipelineId) {
      setShowMobilePipelineDetail(true);
    }
  };

  // Save team config helper
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
      await refetch();
      success('Team saved successfully');
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Find phase index by phase name/id
  const findPhaseIndex = useCallback((phaseId: string): number => {
    if (!teamConfig?.team?.workflow?.phases) return -1;
    return teamConfig.team.workflow.phases.findIndex(p => p.name === phaseId);
  }, [teamConfig]);

  // Phase edit handler (called from DAG)
  const handleEditPhase = useCallback((phaseId: string) => {
    const index = findPhaseIndex(phaseId);
    if (index === -1 || !teamConfig?.team?.workflow?.phases) return;

    const phase = teamConfig.team.workflow.phases[index];
    setPhaseModal({ phase, index });
    setEditedPhase({ ...phase });
  }, [findPhaseIndex, teamConfig]);

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

  // Phase delete handler (called from DAG)
  const handleDeletePhase = useCallback(async (phaseId: string) => {
    const index = findPhaseIndex(phaseId);
    if (index === -1 || !teamConfig?.team?.workflow?.phases) return;

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
  }, [findPhaseIndex, teamConfig, showError]);

  // Open add phase modal
  const handleOpenAddPhase = useCallback(() => {
    const defaultOwner = teamConfig?.team?.agents?.[0]?.name || '';
    setNewPhase({ name: '', owner: defaultOwner, output: '', requires: [] });
    setAddPhaseModal(true);
  }, [teamConfig]);

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

  // Agent config handlers (called from History tab)
  const handleEditAgent = (agent: AgentConfig, index: number) => {
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

  // Create team handlers
  const handleOpenCreateTeam = () => {
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-semibold">Workflows</h1>
          <TeamSelector
            onCreateTeam={handleOpenCreateTeam}
            onManageDepartments={handleOpenDepartments}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Main Tab Navigation */}
      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as WorkflowViewMode)}
        className="flex-1 flex flex-col"
      >
        <div className="px-2 sm:px-4 border-b overflow-x-auto">
          <TabsList className="h-10">
            <TabsTrigger value="dag" className="gap-1 sm:gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">Team Workflow</span>
              <span className="sm:hidden text-xs">Team</span>
            </TabsTrigger>
            <TabsTrigger value="pipelines" className="gap-1 sm:gap-2">
              <GitPullRequest className="h-4 w-4" />
              <span className="hidden sm:inline">Pipelines</span>
              <span className="sm:hidden text-xs">Pipes</span>
            </TabsTrigger>
            <TabsTrigger value="worktrees" className="gap-1 sm:gap-2">
              <FolderGit className="h-4 w-4" />
              <span className="hidden sm:inline">Worktrees</span>
              <span className="sm:hidden text-xs">Trees</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Team Workflow Tab - with sub-tabs */}
          <TabsContent value="dag" className="h-full m-0 flex flex-col">
            {/* Sub-tab navigation for Team Workflow */}
            <div className="px-2 sm:px-4 py-2 border-b">
              <Tabs
                value={teamWorkflowSubTab}
                onValueChange={(v) => setTeamWorkflowSubTab(v as TeamWorkflowSubTab)}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="run" className="gap-1 text-xs">
                    <Play className="h-3 w-3" />
                    Run
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1 text-xs">
                    <History className="h-3 w-3" />
                    History
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 overflow-hidden">
              {teamWorkflowSubTab === 'run' ? (
                <div className="h-full flex flex-col">
                  {/* Control bar with Launch/Kill */}
                  <div className="px-2 sm:px-4 py-2 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Team: <span className="text-foreground font-medium capitalize">{currentTeamName || 'none'}</span>
                      </span>
                      {isTeamRunning && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Running
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isTeamRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleKillTeam}
                          disabled={agentLoading}
                          className="gap-1"
                        >
                          {agentLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Kill Team</span>
                          <span className="sm:hidden">Kill</span>
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setLaunchModalOpen(true)}
                          disabled={agentLoading || !currentTeamName}
                          className="gap-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        >
                          {agentLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Rocket className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">Launch Team</span>
                          <span className="sm:hidden">Launch</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* DAG */}
                  <div className="flex-1 p-2 sm:p-4">
                    <TeamWorkflowDag
                      onEditPhase={handleEditPhase}
                      onDeletePhase={handleDeletePhase}
                      onAddPhase={handleOpenAddPhase}
                    />
                  </div>
                </div>
              ) : (
                <TeamHistoryTab
                  teamConfig={teamConfig}
                  onEditAgent={handleEditAgent}
                  onAddAgent={handleOpenAddAgent}
                  onEditNoteTaker={handleOpenNoteTaker}
                  onEditExceptionHandler={handleOpenExceptionHandler}
                  onRemoveAgentFromTeam={handleRemoveAgentFromTeam}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="pipelines" className="h-full m-0 p-2 sm:p-4">
            <div className="h-full flex flex-col md:grid md:grid-cols-2 gap-2 sm:gap-4">
              {/* Pipeline List */}
              <div className={cn(
                "h-full overflow-auto",
                showMobilePipelineDetail && selectedPipelineId && "hidden md:block"
              )}>
                <ImplementationPipelineList onPipelineSelect={handlePipelineSelect} />
              </div>
              {/* Pipeline Detail */}
              <div className={cn(
                "h-full",
                !showMobilePipelineDetail && "hidden md:flex"
              )}>
                {selectedPipelineId ? (
                  <div className="h-full w-full flex flex-col">
                    {/* Mobile back button */}
                    <div className="flex md:hidden items-center gap-2 mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMobilePipelineDetail(false)}
                        className="gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </Button>
                    </div>
                    <ImplementationPipelineDetail />
                  </div>
                ) : (
                  <div className="flex items-center justify-center border rounded-lg text-muted-foreground w-full h-full">
                    Select a pipeline to view details
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="worktrees" className="h-full m-0 p-2 sm:p-4">
            <WorktreeStatusEnhanced />
          </TabsContent>
        </div>
      </Tabs>

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
                <label className="block text-sm font-medium text-foreground mb-1">Template (optional)</label>
                <Input
                  value={editedPhase.template || ''}
                  onChange={(e) => setEditedPhase({ ...editedPhase, template: e.target.value || undefined })}
                  placeholder="template.md"
                />
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

      {/* Add Phase Modal */}
      {addPhaseModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setAddPhaseModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Add Phase</h3>
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
                <label className="block text-sm font-medium text-foreground mb-1">Template (optional)</label>
                <Input
                  value={newPhase.template || ''}
                  onChange={(e) => setNewPhase({ ...newPhase, template: e.target.value || undefined })}
                  placeholder="template.md"
                />
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

      {/* Note-taker Modal */}
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
              <h3 className="text-lg font-semibold text-foreground">Select Guardian</h3>
              <Button variant="ghost" size="icon" onClick={() => setExceptionHandlerModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
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
              <p className="text-sm text-muted-foreground mt-2">No available agents. Create agents first.</p>
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

      {/* Team Settings Modal */}
      {teamSettingsModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setTeamSettingsModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
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
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
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

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">First Agent</label>
                <Select value={newTeamFirstAgent} onValueChange={setNewTeamFirstAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agentInfos.filter(isTeamEligibleAgent).map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name} ({agent.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      {/* Departments Modal */}
      {departmentsModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setDepartmentsModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Manage Departments</h3>
              <Button variant="ghost" size="icon" onClick={() => setDepartmentsModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

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

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setDepartmentsModal(false)}>Cancel</Button>
              <Button onClick={saveDepartmentsConfig} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Project Select Modal for launching team */}
      <ProjectSelectModal
        open={launchModalOpen}
        onOpenChange={setLaunchModalOpen}
        onLaunch={handleLaunchTeam}
        projects={projects}
        isLoading={isLaunching}
        teamName={currentTeamName}
      />
    </div>
  );
}
