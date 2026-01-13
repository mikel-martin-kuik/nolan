import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { TeamWorkflowDag } from './TeamWorkflowDag';
import { ImplementationPipelineList } from './ImplementationPipelineList';
import { ImplementationPipelineDetail } from './ImplementationPipelineDetail';
import { WorktreeStatusEnhanced } from './WorktreeStatusEnhanced';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, GitBranch, GitPullRequest, FolderGit } from 'lucide-react';
import type { WorkflowViewMode } from '../../types/workflow';

export function WorkflowVisualizerPanel() {
  const viewMode = useWorkflowVisualizerStore((state) => state.viewMode);
  const setViewMode = useWorkflowVisualizerStore((state) => state.setViewMode);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const { refetch, isLoading } = useWorkflowData();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tab Navigation */}
      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as WorkflowViewMode)}
        className="flex-1 flex flex-col"
      >
        <div className="px-4 border-b">
          <TabsList className="h-10">
            <TabsTrigger value="dag" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Team Workflow
            </TabsTrigger>
            <TabsTrigger value="pipelines" className="gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pipelines
            </TabsTrigger>
            <TabsTrigger value="worktrees" className="gap-2">
              <FolderGit className="h-4 w-4" />
              Worktrees
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="dag" className="h-full m-0 p-4">
            <TeamWorkflowDag />
          </TabsContent>

          <TabsContent value="pipelines" className="h-full m-0 p-4">
            <div className="h-full grid grid-cols-2 gap-4">
              <ImplementationPipelineList />
              {selectedPipelineId ? (
                <ImplementationPipelineDetail />
              ) : (
                <div className="flex items-center justify-center border rounded-lg text-muted-foreground">
                  Select a pipeline to view details
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="worktrees" className="h-full m-0 p-4">
            <WorktreeStatusEnhanced />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
