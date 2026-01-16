import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@/lib/api';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useTeamStore } from '../../store/teamStore';
import { useAgentStore } from '../../store/agentStore';
import { useNavigationStore } from '../../store/navigationStore';
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
import { RefreshCw, GitBranch, GitPullRequest, FolderGit, ChevronLeft, Play, History, Rocket, Square, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowViewMode } from '../../types/workflow';
import type { TeamWorkflowSubTab } from '../../store/workflowVisualizerStore';
import type { ProjectInfo } from '../../types/projects';

export function WorkflowVisualizerPanel() {
  const viewMode = useWorkflowVisualizerStore((state) => state.viewMode);
  const setViewMode = useWorkflowVisualizerStore((state) => state.setViewMode);
  const teamWorkflowSubTab = useWorkflowVisualizerStore((state) => state.teamWorkflowSubTab);
  const setTeamWorkflowSubTab = useWorkflowVisualizerStore((state) => state.setTeamWorkflowSubTab);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const pipelines = useWorkflowVisualizerStore((state) => state.pipelines);
  const { refetch, isLoading, teamConfig } = useWorkflowData();
  const { currentTeamName } = useTeamStore();
  const { launchTeam, killTeam, loading: agentLoading, teamAgents, updateStatus: updateAgentStatus } = useAgentStore();
  const { error: showError } = useToastStore();
  const navigateToBuilder = useNavigationStore((state) => state.navigateToBuilder);

  // Launch modal state
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Check if current team is running (any agent in team is active)
  const isTeamRunning = teamAgents.some(a => a.team === currentTeamName && a.active);

  // Mobile: track whether to show pipeline detail (vs pipeline list)
  const [showMobilePipelineDetail, setShowMobilePipelineDetail] = useState(false);

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

  // When pipeline is selected on mobile, show detail view
  const handlePipelineSelect = () => {
    if (selectedPipelineId) {
      setShowMobilePipelineDetail(true);
    }
  };

  // Navigate to Builder for editing
  const handleEditInBuilder = (subTab: 'teams', context?: { teamId?: string }) => {
    navigateToBuilder(subTab, context);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b">
        <h1 className="text-lg sm:text-xl font-semibold">Workflows</h1>
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
            <div className="px-2 sm:px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TeamSelector />
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditInBuilder('teams', { teamId: currentTeamName })}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <Wrench className="w-3 h-3" />
                <span className="hidden sm:inline text-xs">Edit in Builder</span>
              </Button>
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 overflow-hidden">
              {teamWorkflowSubTab === 'run' ? (
                <div className="h-full flex flex-col">
                  {/* Control bar with Launch/Kill */}
                  <div className="px-2 sm:px-4 py-2 border-b flex items-center gap-2">
                    {isTeamRunning ? (
                      <>
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
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Running
                        </span>
                      </>
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

                  {/* DAG - Read-only visualization */}
                  <div className="flex-1 p-2 sm:p-4">
                    <TeamWorkflowDag readOnly />
                  </div>
                </div>
              ) : (
                <TeamHistoryTab teamConfig={teamConfig} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="pipelines" className="h-full m-0 p-2 sm:p-4">
            {pipelines.length === 0 ? (
              /* No pipelines - show template view full width */
              <div className="h-full overflow-auto">
                <ImplementationPipelineList onPipelineSelect={handlePipelineSelect} />
              </div>
            ) : (
              /* Has pipelines - show list + detail side by side */
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
            )}
          </TabsContent>

          <TabsContent value="worktrees" className="h-full m-0 p-2 sm:p-4">
            <WorktreeStatusEnhanced />
          </TabsContent>
        </div>
      </Tabs>

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
