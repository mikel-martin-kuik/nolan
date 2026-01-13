import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { useToastStore } from '../../store/toastStore';
import { invoke } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  GitBranch
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

  const handleTriggerAgent = async (agentName: string) => {
    try {
      await invoke('trigger_cron_agent', { name: agentName });
      showSuccess(`Triggered ${agentName}`);
    } catch (error) {
      showError(`Failed to trigger ${agentName}: ${error}`);
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
              'secondary'
            }
          >
            {pipeline.overallStatus}
          </Badge>
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
                  {stage?.agentName && stage?.status !== 'running' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTriggerAgent(stage.agentName!)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Trigger
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
    default:
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
  }
}
