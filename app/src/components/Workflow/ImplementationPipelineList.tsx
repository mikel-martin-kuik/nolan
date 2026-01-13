import { useMemo, useState } from 'react';
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
  Clock
} from 'lucide-react';
import type { ImplementationPipeline } from '../../types/workflow';
import { cn } from '@/lib/utils';

const stageIcons = {
  idea: Lightbulb,
  implementer: Code,
  analyzer: Search,
  qa: TestTube,
  merger: GitMerge,
};

const statusIcons = {
  pending: Clock,
  running: Loader2,
  success: CheckCircle,
  failed: XCircle,
  skipped: Clock,
};

const statusColors = {
  pending: 'text-gray-400',
  running: 'text-blue-500 animate-spin',
  success: 'text-green-500',
  failed: 'text-red-500',
  skipped: 'text-gray-300',
};

interface ImplementationPipelineListProps {
  onPipelineSelect?: (pipeline: ImplementationPipeline) => void;
}

export function ImplementationPipelineList({ onPipelineSelect }: ImplementationPipelineListProps) {
  const pipelines = useWorkflowVisualizerStore((state) => state.pipelines);
  const selectedPipelineId = useWorkflowVisualizerStore((state) => state.selectedPipelineId);
  const setSelectedPipelineId = useWorkflowVisualizerStore((state) => state.setSelectedPipelineId);
  const isLoading = useWorkflowVisualizerStore((state) => state.isLoading);

  // Group pipelines by idea
  const groupedPipelines = useMemo(() => {
    const groups = new Map<string, ImplementationPipeline[]>();

    pipelines.forEach((pipeline) => {
      const ideaId = pipeline.ideaId;
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
  pipelines: ImplementationPipeline[];
  selectedPipelineId: string | null;
  onSelect: (pipeline: ImplementationPipeline) => void;
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
          {pipelines[0].ideaTitle}
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
  pipeline: ImplementationPipeline;
  isSelected: boolean;
  onSelect: () => void;
}

function PipelineRow({ pipeline, isSelected, onSelect }: PipelineRowProps) {
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
        <Badge
          variant={
            pipeline.overallStatus === 'completed' ? 'default' :
            pipeline.overallStatus === 'failed' ? 'destructive' :
            'secondary'
          }
          className="text-xs"
        >
          {pipeline.overallStatus}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(pipeline.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Stage progress */}
      <div className="flex items-center gap-1">
        {(['implementer', 'analyzer', 'qa', 'merger'] as const).map((stageType) => {
          const stage = pipeline.stages.find((s) => s.type === stageType);
          const StageIcon = stageIcons[stageType];
          const StatusIcon = statusIcons[stage?.status || 'pending'];
          const statusColor = statusColors[stage?.status || 'pending'];

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
