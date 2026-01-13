import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { User, FileText, CheckCircle, XCircle, Loader2, Circle } from 'lucide-react';
import type { PhaseNode as PhaseNodeType, PhaseNodeData, PhaseNodeStatus } from '../../../types/workflow';
import { cn } from '@/lib/utils';

const statusConfig: Record<PhaseNodeStatus, { color: string; icon: typeof Circle; iconColor: string }> = {
  idle: { color: 'bg-gray-100 border-gray-300', icon: Circle, iconColor: 'text-gray-400' },
  running: { color: 'bg-blue-50 border-blue-400', icon: Loader2, iconColor: 'text-blue-500 animate-spin' },
  success: { color: 'bg-green-50 border-green-400', icon: CheckCircle, iconColor: 'text-green-500' },
  failed: { color: 'bg-red-50 border-red-400', icon: XCircle, iconColor: 'text-red-500' },
  blocked: { color: 'bg-yellow-50 border-yellow-400', icon: Circle, iconColor: 'text-yellow-500' },
};

export const PhaseNode = memo(({ data, selected }: NodeProps<PhaseNodeType>) => {
  const nodeData = data as PhaseNodeData;
  const config = statusConfig[nodeData.status];
  const StatusIcon = config.icon;

  return (
    <Card
      className={cn(
        'w-44 p-3 border-2 transition-all',
        config.color,
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{nodeData.phaseName}</h4>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{nodeData.ownerAgent}</span>
          </div>
        </div>
        <Tooltip content={nodeData.status} side="top">
          <StatusIcon className={cn('h-5 w-5', config.iconColor)} />
        </Tooltip>
      </div>

      {nodeData.outputFile && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="truncate">{nodeData.outputFile}</span>
        </div>
      )}

      {nodeData.requires && nodeData.requires.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {nodeData.requires.map((req: string) => (
            <Badge key={req} variant="outline" className="text-[10px] px-1 py-0">
              {req}
            </Badge>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </Card>
  );
});

PhaseNode.displayName = 'PhaseNode';
