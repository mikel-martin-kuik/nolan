import { useState } from 'react';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useToastStore } from '../../store/toastStore';
import { invoke } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { RunLogViewerModal } from './RunLogViewerModal';
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
  StopCircle,
  AlertCircle,
  Ban,
  FileText
} from 'lucide-react';
import type { PipelineStageStatus } from '../../types/generated/cronos/PipelineStageStatus';
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
  const fetchPipelines = useWorkflowVisualizerStore((state) => state.fetchPipelines);
  const skipStage = useWorkflowVisualizerStore((state) => state.skipStage);
  const abortPipeline = useWorkflowVisualizerStore((state) => state.abortPipeline);
  const completePipeline = useWorkflowVisualizerStore((state) => state.completePipeline);
  const retryStage = useWorkflowVisualizerStore((state) => state.retryStage);
  const { success: showSuccess, error: showError } = useToastStore();

  // Dialog state
  const [skipDialog, setSkipDialog] = useState<{ open: boolean; stageType: string; runId: string } | null>(null);
  const [abortStageDialog, setAbortStageDialog] = useState<{ open: boolean; agentName: string } | null>(null);
  const [abortPipelineDialog, setAbortPipelineDialog] = useState(false);
  const [completePipelineDialog, setCompletePipelineDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [logViewer, setLogViewer] = useState<{ runId: string; stageName: string } | null>(null);

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
    setActionLoading(true);
    try {
      await invoke('trigger_cron_agent', { name: agentName });
      showSuccess(`Triggered ${agentName}`);
      await fetchPipelines();
    } catch (error) {
      showError(`Failed to trigger ${agentName}: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async (runId: string) => {
    setActionLoading(true);
    try {
      await retryStage(runId);
      showSuccess('Stage retry initiated');
    } catch (error) {
      showError(`Failed to retry: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async (runId: string, prompt?: string) => {
    setActionLoading(true);
    try {
      await invoke('relaunch_cron_session', { run_id: runId, follow_up_prompt: prompt || '' });
      showSuccess('Resumed session');
      await fetchPipelines();
    } catch (error) {
      showError(`Failed to resume: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkip = async (runId: string) => {
    setActionLoading(true);
    try {
      await skipStage(runId, 'Manually skipped by user');
      showSuccess('Stage skipped');
      setSkipDialog(null);
    } catch (error) {
      showError(`Failed to skip: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbortStage = async (agentName: string) => {
    setActionLoading(true);
    try {
      await invoke('cancel_cron_agent', { name: agentName });
      showSuccess('Stage aborted');
      setAbortStageDialog(null);
      await fetchPipelines();
    } catch (error) {
      showError(`Failed to abort: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbortPipeline = async () => {
    setActionLoading(true);
    try {
      await abortPipeline(pipeline.id, 'Manually aborted by user');
      showSuccess('Pipeline aborted');
      setAbortPipelineDialog(false);
    } catch (error) {
      showError(`Failed to abort pipeline: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompletePipeline = async () => {
    setActionLoading(true);
    try {
      await completePipeline(pipeline.id, 'Manually completed by user');
      showSuccess('Pipeline marked as complete');
      setCompletePipelineDialog(false);
    } catch (error) {
      showError(`Failed to complete pipeline: ${error}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewLogs = (runId: string, stageName: string) => {
    setLogViewer({ runId, stageName });
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
            <CardTitle className="text-base">{pipeline.idea_title}</CardTitle>
            {pipeline.worktree_branch && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono text-xs">{pipeline.worktree_branch}</span>
              </div>
            )}
          </div>
          <Badge
            variant={
              pipeline.status === 'completed' ? 'default' :
              pipeline.status === 'failed' || pipeline.status === 'aborted' ? 'destructive' :
              pipeline.status === 'blocked' ? 'outline' :
              'secondary'
            }
          >
            {pipeline.status}
          </Badge>
          {(pipeline.status === 'in_progress' || pipeline.status === 'created') && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => setCompletePipelineDialog(true)}
                disabled={actionLoading}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Complete
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setAbortPipelineDialog(true)}
                disabled={actionLoading}
              >
                <StopCircle className="h-3 w-3 mr-1" />
                Abort
              </Button>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(['implementer', 'analyzer', 'qa', 'merger'] as const).map((stageType) => {
          const stage = pipeline.stages.find((s) => s.stage_type === stageType);
          const config = stageConfig[stageType];
          const Icon = config.icon;

          return (
            <div key={stageType}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    stage?.status === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                    stage?.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30' :
                    stage?.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    stage?.status === 'skipped' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    stage?.status === 'blocked' ? 'bg-orange-100 dark:bg-orange-900/30' :
                    'bg-muted'
                  )}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>
                  <div>
                    <p className="font-medium">{config.label}</p>
                    {stage?.agent_name && (
                      <p className="text-sm text-muted-foreground font-mono">{stage.agent_name}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StageStatusBadge status={stage?.status} />

                  {/* View Logs - show if has run_id */}
                  {stage?.run_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewLogs(stage.run_id!, config.label)}
                      disabled={actionLoading}
                    >
                      <FileText className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Trigger - show for pending stages */}
                  {stage?.agent_name && stage?.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTriggerAgent(stage.agent_name)}
                      disabled={actionLoading}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Trigger
                    </Button>
                  )}

                  {/* Retry - show for failed stages */}
                  {stage?.status === 'failed' && stage?.run_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(stage.run_id!)}
                      disabled={actionLoading}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}

                  {/* Resume - show if has run_id and completed (for follow-up) */}
                  {stage?.run_id && stage?.status === 'success' && stage?.verdict?.verdict === 'FOLLOWUP' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResume(stage.run_id!, stage.verdict?.follow_up_prompt || '')}
                      disabled={actionLoading}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Continue
                    </Button>
                  )}

                  {/* Skip - show for pending/failed/blocked stages with run_id */}
                  {stage?.run_id && (stage?.status === 'pending' || stage?.status === 'failed' || stage?.status === 'blocked') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSkipDialog({ open: true, stageType: config.label, runId: stage.run_id! })}
                      disabled={actionLoading}
                    >
                      <SkipForward className="h-3 w-3 mr-1" />
                      Skip
                    </Button>
                  )}

                  {/* Abort Stage - show for running stages */}
                  {stage?.status === 'running' && stage?.agent_name && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setAbortStageDialog({ open: true, agentName: stage.agent_name })}
                      disabled={actionLoading}
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              {/* Verdict display */}
              {stage?.verdict && (
                <div className="ml-12 mt-2 p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={
                      stage.verdict.verdict === 'COMPLETE' ? 'default' :
                      stage.verdict.verdict === 'FOLLOWUP' ? 'secondary' :
                      'destructive'
                    }>
                      {stage.verdict.verdict}
                    </Badge>
                  </div>
                  {stage.verdict.reason && (
                    <p className="text-sm text-muted-foreground">{stage.verdict.reason}</p>
                  )}
                  {stage.verdict.follow_up_prompt && (
                    <p className="text-sm text-muted-foreground mt-1 italic">
                      Follow-up: {stage.verdict.follow_up_prompt}
                    </p>
                  )}
                </div>
              )}

              {/* Skip reason display */}
              {stage?.skip_reason && (
                <div className="ml-12 mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Skipped:</span> {stage.skip_reason}
                  </p>
                </div>
              )}

              {/* Timing info */}
              {stage?.started_at && (
                <div className="ml-12 mt-2 text-xs text-muted-foreground">
                  Started: {new Date(stage.started_at).toLocaleString()}
                  {stage.completed_at && (
                    <span className="ml-2">
                      | Completed: {new Date(stage.completed_at).toLocaleString()}
                    </span>
                  )}
                  {stage.attempt > 1 && (
                    <span className="ml-2">| Attempt #{stage.attempt}</span>
                  )}
                </div>
              )}

              {stageType !== 'merger' && (
                <div className="border-t mt-4" />
              )}
            </div>
          );
        })}

        {/* Pipeline cost summary */}
        {pipeline.total_cost_usd !== null && pipeline.total_cost_usd > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Total cost: <span className="font-mono">${pipeline.total_cost_usd.toFixed(4)}</span>
            </p>
          </div>
        )}
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

      {/* Complete Pipeline Confirmation Dialog */}
      <ConfirmDialog
        open={completePipelineDialog}
        onOpenChange={setCompletePipelineDialog}
        title="Mark Pipeline as Complete?"
        description="This will mark the pipeline as manually completed. Use this if the work was completed outside the pipeline or no further action is needed."
        confirmLabel="Complete Pipeline"
        onConfirm={handleCompletePipeline}
      />

      {/* Log Viewer Modal */}
      <RunLogViewerModal
        runId={logViewer?.runId ?? null}
        stageName={logViewer?.stageName}
        onClose={() => setLogViewer(null)}
      />
    </Card>
  );
}

function StageStatusBadge({ status }: { status?: PipelineStageStatus }) {
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
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case 'skipped':
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
          <Ban className="h-3 w-3 mr-1" />
          Skipped
        </Badge>
      );
    case 'blocked':
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-600">
          <AlertCircle className="h-3 w-3 mr-1" />
          Blocked
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
