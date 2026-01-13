import { useState } from 'react';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useToastStore } from '../../store/toastStore';
import { invoke } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  Code,
  Search,
  TestTube,
  GitMerge,
  Play,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  GitBranch,
  RotateCcw,
  SkipForward,
  Square,
  StopCircle
} from 'lucide-react';
import type { PipelineStage } from '../../types/workflow';
import { cn } from '@/lib/utils';

const stageConfig = {
  implementer: { icon: Code, label: 'Implementer', color: 'text-blue-500' },
  analyzer: { icon: Search, label: 'Analyzer', color: 'text-purple-500' },
  qa: { icon: TestTube, label: 'QA', color: 'text-orange-500' },
  merger: { icon: GitMerge, label: 'Merger', color: 'text-green-500' },
};

export function ImplementationPipelineDetail() {
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const pipelines = useWorkflowVisualizerStore((state) => state.pipelines);
  const setSelectedPipelineId = useWorkflowVisualizerStore((state) => state.setSelectedPipelineId);
  const { success: showSuccess, error: showError } = useToastStore();

  // Dialog state
  const [skipDialog, setSkipDialog] = useState<{ open: boolean; stageType: string; runId: string } | null>(null);
  const [abortStageDialog, setAbortStageDialog] = useState<{ open: boolean; agentName: string } | null>(null);
  const [abortPipelineDialog, setAbortPipelineDialog] = useState(false);

  const pipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (!pipeline) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a pipeline to view details</p>
        </div>
      </Card>
    );
  }

  // Handlers
  const handleTriggerAgent = async (agentName: string) => {
    try {
      await invoke('trigger_cron_agent', { name: agentName });
      showSuccess(`Triggered ${agentName}`);
    } catch (error) {
      showError(`Failed to trigger ${agentName}: ${error}`);
    }
  };

  const handleRetry = async (agentName: string) => {
    try {
      await invoke('trigger_cron_agent', { name: agentName });
      showSuccess(`Retrying ${agentName}`);
    } catch (error) {
      showError(`Failed to retry: ${error}`);
    }
  };

  const handleResume = async (runId: string) => {
    try {
      await invoke('relaunch_cron_session', { run_id: runId, follow_up_prompt: '' });
      showSuccess('Resumed session');
    } catch (error) {
      showError(`Failed to resume: ${error}`);
    }
  };

  const handleSkip = async (runId: string) => {
    try {
      await invoke('skip_pipeline_stage', { run_id: runId, reason: 'Manually skipped' });
      showSuccess('Stage skipped');
    } catch (error) {
      showError(`Failed to skip: ${error}`);
    }
  };

  const handleAbortStage = async (agentName: string) => {
    try {
      await invoke('cancel_cron_agent', { name: agentName });
      showSuccess('Stage aborted');
    } catch (error) {
      showError(`Failed to abort: ${error}`);
    }
  };

  const handleAbortPipeline = async () => {
    try {
      await invoke('abort_pipeline', { pipeline_id: pipeline.id, reason: 'Manually aborted' });
      showSuccess('Pipeline aborted');
    } catch (error) {
      showError(`Failed to abort pipeline: ${error}`);
    }
  };

  return (
    <Card className="h-full overflow-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedPipelineId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <CardTitle>{pipeline.ideaTitle}</CardTitle>
            {pipeline.worktreeBranch && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono text-xs">{pipeline.worktreeBranch}</span>
              </div>
            )}
          </div>
          <Badge
            variant={
              pipeline.overallStatus === 'completed' ? 'default' :
              pipeline.overallStatus === 'failed' ? 'destructive' :
              pipeline.overallStatus === 'aborted' ? 'destructive' :
              'secondary'
            }
          >
            {pipeline.overallStatus}
          </Badge>
          {pipeline.overallStatus === 'in_progress' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setAbortPipelineDialog(true)}
            >
              <StopCircle className="h-3 w-3 mr-1" />
              Abort
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(['implementer', 'analyzer', 'qa', 'merger'] as const).map((stageType) => {
          const stage = pipeline.stages.find((s) => s.type === stageType);
          const config = stageConfig[stageType];
          const Icon = config.icon;

          return (
            <div key={stageType}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    stage?.status === 'success' ? 'bg-green-100' :
                    stage?.status === 'failed' ? 'bg-red-100' :
                    stage?.status === 'running' ? 'bg-blue-100' :
                    stage?.status === 'skipped' ? 'bg-yellow-100' :
                    'bg-muted'
                  )}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>
                  <div>
                    <p className="font-medium">{config.label}</p>
                    {stage?.agentName && (
                      <p className="text-sm text-muted-foreground">{stage.agentName}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StageStatusBadge status={stage?.status} />

                  {/* Trigger - show for pending stages */}
                  {stage?.agentName && stage?.status !== 'running' && stage?.status !== 'success' && stage?.status !== 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTriggerAgent(stage.agentName!)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Trigger
                    </Button>
                  )}

                  {/* Retry - show for failed stages */}
                  {stage?.status === 'failed' && stage?.agentName && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(stage.agentName!)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}

                  {/* Resume - show if has runId and not running */}
                  {stage?.runId && stage?.status !== 'running' && stage?.status !== 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResume(stage.runId!)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Resume
                    </Button>
                  )}

                  {/* Skip - show for pending/failed stages with runId */}
                  {stage?.runId && stage?.status !== 'success' && stage?.status !== 'running' && stage?.status !== 'skipped' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSkipDialog({ open: true, stageType: config.label, runId: stage.runId! })}
                    >
                      <SkipForward className="h-3 w-3 mr-1" />
                      Skip
                    </Button>
                  )}

                  {/* Abort Stage - show for running stages */}
                  {stage?.status === 'running' && stage?.agentName && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setAbortStageDialog({ open: true, agentName: stage.agentName! })}
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Abort
                    </Button>
                  )}
                </div>
              </div>

              {stage?.verdict && (
                <div className="ml-12 mt-2 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Verdict: {stage.verdict.outcome}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stage.verdict.summary}</p>
                </div>
              )}

              {stageType !== 'merger' && (
                <div className="border-t mt-4" />
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Skip Confirmation Dialog */}
      <ConfirmDialog
        open={skipDialog?.open ?? false}
        onOpenChange={(open) => !open && setSkipDialog(null)}
        title="Skip Stage?"
        description={`This will mark the ${skipDialog?.stageType} stage as skipped and advance the pipeline.`}
        confirmLabel="Skip Stage"
        onConfirm={() => skipDialog && handleSkip(skipDialog.runId)}
      />

      {/* Abort Stage Confirmation Dialog */}
      <ConfirmDialog
        open={abortStageDialog?.open ?? false}
        onOpenChange={(open) => !open && setAbortStageDialog(null)}
        title="Abort Running Stage?"
        description={`This will cancel the running ${abortStageDialog?.agentName} agent.`}
        confirmLabel="Abort Stage"
        onConfirm={() => abortStageDialog && handleAbortStage(abortStageDialog.agentName)}
        variant="destructive"
      />

      {/* Abort Pipeline Confirmation Dialog */}
      <ConfirmDialog
        open={abortPipelineDialog}
        onOpenChange={setAbortPipelineDialog}
        title="Abort Entire Pipeline?"
        description="This will cancel all running stages and mark the pipeline as aborted."
        confirmLabel="Abort Pipeline"
        onConfirm={handleAbortPipeline}
        variant="destructive"
      />
    </Card>
  );
}

function StageStatusBadge({ status }: { status?: PipelineStage['status'] }) {
  switch (status) {
    case 'success':
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Complete
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case 'skipped':
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
          <SkipForward className="h-3 w-3 mr-1" />
          Skipped
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}
