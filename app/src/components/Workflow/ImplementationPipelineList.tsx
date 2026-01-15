import { useMemo, useState, useEffect } from 'react';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronRight,
  ChevronDown,
  Lightbulb,
  Code,
  Search,
  TestTube,
  GitMerge,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ArrowRight,
  FileCode,
  AlertCircle,
  Ban
} from 'lucide-react';
import type { Pipeline } from '../../types/generated/scheduler/Pipeline';
import type { PipelineDefinition } from '../../types/generated/scheduler/PipelineDefinition';
import type { PipelineStageStatus } from '../../types/generated/scheduler/PipelineStageStatus';
import { invoke } from '@/lib/api';
import { cn } from '@/lib/utils';

const stageIcons: Record<string, typeof Code> = {
  idea: Lightbulb,
  implementer: Code,
  analyzer: Search,
  qa: TestTube,
  merger: GitMerge,
};

const statusIcons: Record<PipelineStageStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  success: CheckCircle,
  failed: XCircle,
  skipped: Ban,
  blocked: AlertCircle,
};

const statusColors: Record<PipelineStageStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-500 animate-spin',
  success: 'text-green-500',
  failed: 'text-red-500',
  skipped: 'text-gray-300',
  blocked: 'text-orange-500',
};

interface ImplementationPipelineListProps {
  onPipelineSelect?: (pipeline: Pipeline) => void;
}

export function ImplementationPipelineList({ onPipelineSelect }: ImplementationPipelineListProps) {
  const pipelines = useWorkflowVisualizerStore((state) => state.pipelines);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const setSelectedPipelineId = useWorkflowVisualizerStore((state) => state.setSelectedPipelineId);
  const isLoading = useWorkflowVisualizerStore((state) => state.isLoading);
  const fetchPipelines = useWorkflowVisualizerStore((state) => state.fetchPipelines);

  // Fetch pipelines on mount
  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // Auto-select when there's only one pipeline and none is selected
  useEffect(() => {
    if (pipelines.length === 1 && !selectedPipelineId && !isLoading) {
      const pipeline = pipelines[0];
      setSelectedPipelineId(pipeline.id);
      onPipelineSelect?.(pipeline);
    }
  }, [pipelines, selectedPipelineId, isLoading, setSelectedPipelineId, onPipelineSelect]);

  // Group pipelines by idea
  const groupedPipelines = useMemo(() => {
    const groups = new Map<string, Pipeline[]>();

    pipelines.forEach((pipeline) => {
      const ideaId = pipeline.idea_id;
      if (!groups.has(ideaId)) {
        groups.set(ideaId, []);
      }
      groups.get(ideaId)!.push(pipeline);
    });

    return Array.from(groups.entries());
  }, [pipelines]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Implementation Pipelines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pipelines.length === 0) {
    return <PipelineTemplateView />;
  }

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="sticky top-0 bg-background z-10">
        <CardTitle className="flex items-center justify-between">
          <span>Implementation Pipelines</span>
          <Badge variant="secondary">{pipelines.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groupedPipelines.map(([ideaId, ideaPipelines]) => (
          <PipelineGroup
            key={ideaId}
            pipelines={ideaPipelines}
            selectedPipelineId={selectedPipelineId}
            onSelect={(pipeline) => {
              setSelectedPipelineId(pipeline.id);
              onPipelineSelect?.(pipeline);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface PipelineGroupProps {
  pipelines: Pipeline[];
  selectedPipelineId: string | null;
  onSelect: (pipeline: Pipeline) => void;
}

function PipelineGroup({ pipelines, selectedPipelineId, onSelect }: PipelineGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded transition-colors">
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Lightbulb className="h-4 w-4 text-yellow-500" />
        <span className="font-medium truncate flex-1 text-left">
          {pipelines[0].idea_title}
        </span>
        <Badge variant="outline">{pipelines.length}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-2 mt-2">
        {pipelines.map((pipeline) => (
          <PipelineRow
            key={pipeline.id}
            pipeline={pipeline}
            isSelected={selectedPipelineId === pipeline.id}
            onSelect={() => onSelect(pipeline)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface PipelineRowProps {
  pipeline: Pipeline;
  isSelected: boolean;
  onSelect: () => void;
}

function PipelineRow({ pipeline, isSelected, onSelect }: PipelineRowProps) {
  const statusVariant =
    pipeline.status === 'completed' ? 'default' :
    pipeline.status === 'failed' || pipeline.status === 'aborted' ? 'destructive' :
    pipeline.status === 'blocked' ? 'outline' :
    'secondary';

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-3 rounded border text-left transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={statusVariant} className="text-xs">
          {pipeline.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(pipeline.created_at).toLocaleDateString()}
        </span>
        {pipeline.worktree_branch && (
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
            {pipeline.worktree_branch}
          </span>
        )}
      </div>

      {/* Stage progress */}
      <div className="flex items-center gap-1">
        {(['implementer', 'analyzer', 'qa', 'merger'] as const).map((stageType) => {
          const stage = pipeline.stages.find((s) => s.stage_type === stageType);
          const StageIcon = stageIcons[stageType];
          const stageStatus: PipelineStageStatus = stage?.status || 'pending';
          const StatusIcon = statusIcons[stageStatus];
          const statusColor = statusColors[stageStatus];

          return (
            <div key={stageType} className="flex items-center">
              <div className="relative">
                <StageIcon className="h-5 w-5 text-muted-foreground" />
                <StatusIcon
                  className={cn('h-3 w-3 absolute -bottom-1 -right-1', statusColor)}
                />
              </div>
              {stageType !== 'merger' && (
                <div className={cn(
                  'w-4 h-0.5 mx-1',
                  stage?.status === 'success' ? 'bg-green-500' : 'bg-muted'
                )} />
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// =============================================================================
// Pipeline Template View - Shows pipeline definition when no active pipelines
// =============================================================================

function PipelineTemplateView() {
  const [definition, setDefinition] = useState<PipelineDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDefinition() {
      try {
        const def = await invoke<PipelineDefinition>('get_default_pipeline_definition', {});
        setDefinition(def);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline template');
      } finally {
        setLoading(false);
      }
    }
    fetchDefinition();
  }, []);

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !definition) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No active pipelines</p>
          <p className="text-sm">Pipelines appear when implementer agents run</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode className="h-5 w-5" />
          <span>{definition.name}</span>
          <Badge variant="outline" className="ml-auto">v{definition.version}</Badge>
        </CardTitle>
        {definition.description && (
          <p className="text-sm text-muted-foreground">{definition.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Pipeline flow visualization */}
          <div className="flex items-center justify-center gap-2 py-4 px-2 bg-muted/30 rounded-lg">
            {definition.stages.map((stage, index) => {
              const StageIcon = stageIcons[stage.name as keyof typeof stageIcons] || Code;
              return (
                <div key={stage.name} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <StageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-xs mt-1 capitalize">{stage.name}</span>
                  </div>
                  {index < definition.stages.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Stage details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Stage Details</h4>
            {definition.stages.map((stage) => {
              const StageIcon = stageIcons[stage.name as keyof typeof stageIcons] || Code;
              return (
                <div
                  key={stage.name}
                  className="p-3 border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium capitalize">{stage.name}</span>
                    <div className="flex gap-1 ml-auto">
                      {stage.retryable && (
                        <Badge variant="outline" className="text-xs">retryable</Badge>
                      )}
                      {stage.skippable && (
                        <Badge variant="outline" className="text-xs">skippable</Badge>
                      )}
                    </div>
                  </div>
                  {stage.description && (
                    <p className="text-sm text-muted-foreground mb-2">{stage.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono bg-muted px-1 rounded">{stage.agent}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info message */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>No active pipelines running</p>
            <p className="text-xs">Accept an idea to start a new pipeline</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
