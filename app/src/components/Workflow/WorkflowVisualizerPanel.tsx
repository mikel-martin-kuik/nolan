import { useState } from 'react';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { TeamWorkflowDag } from './TeamWorkflowDag';
import { ImplementationPipelineList } from './ImplementationPipelineList';
import { ImplementationPipelineDetail } from './ImplementationPipelineDetail';
import { WorktreeStatusEnhanced } from './WorktreeStatusEnhanced';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, GitBranch, GitPullRequest, FolderGit, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowViewMode } from '../../types/workflow';

export function WorkflowVisualizerPanel() {
  const viewMode = useWorkflowVisualizerStore((state) => state.viewMode);
  const setViewMode = useWorkflowVisualizerStore((state) => state.setViewMode);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const { refetch, isLoading } = useWorkflowData();

  // Mobile: track whether to show pipeline detail (vs pipeline list)
  const [showMobilePipelineDetail, setShowMobilePipelineDetail] = useState(false);

  // When pipeline is selected on mobile, show detail view
  const handlePipelineSelect = () => {
    if (selectedPipelineId) {
      setShowMobilePipelineDetail(true);
    }
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

      {/* Tab Navigation */}
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
          <TabsContent value="dag" className="h-full m-0 p-2 sm:p-4">
            <TeamWorkflowDag />
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
    </div>
  );
}
