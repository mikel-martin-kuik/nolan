import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { NotebookPen, Shield, CheckCircle, XCircle, Loader2, Circle } from 'lucide-react';
import type { SupportAgentNode as SupportAgentNodeType, SupportAgentData, PhaseNodeStatus } from '../../../types/workflow';
import { cn } from '@/lib/utils';

const statusConfig: Record<PhaseNodeStatus, { iconColor: string }> = {
  idle: { iconColor: 'text-gray-400' },
  running: { iconColor: 'text-blue-500 animate-spin' },
  success: { iconColor: 'text-green-500' },
  failed: { iconColor: 'text-red-500' },
  blocked: { iconColor: 'text-yellow-500' },
};

const roleConfig = {
  note_taker: {
    icon: NotebookPen,
    label: 'Note Taker',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    iconBgColor: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  guardian: {
    icon: Shield,
    label: 'Guardian',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    iconBgColor: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
};

const StatusIcon: Record<PhaseNodeStatus, typeof Circle> = {
  idle: Circle,
  running: Loader2,
  success: CheckCircle,
  failed: XCircle,
  blocked: Circle,
};

export const SupportAgentNode = memo(({ data, selected }: NodeProps<SupportAgentNodeType>) => {
  const nodeData = data as SupportAgentData;
  const config = roleConfig[nodeData.role];
  const statusCfg = statusConfig[nodeData.status];
  const RoleIcon = config.icon;
  const StatusIconComponent = StatusIcon[nodeData.status];

  return (
    <Card
      className={cn(
        'w-40 p-2.5 border-2 border-dashed transition-all',
        config.bgColor,
        config.borderColor,
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn('p-1.5 rounded-md', config.iconBgColor)}>
          <RoleIcon className={cn('h-4 w-4', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-medium text-xs truncate">{config.label}</h4>
            <Tooltip content={nodeData.status} side="top">
              <StatusIconComponent className={cn('h-3.5 w-3.5 flex-shrink-0', statusCfg.iconColor)} />
            </Tooltip>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{nodeData.agentName}</p>
        </div>
      </div>
      {nodeData.description && (
        <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">
          {nodeData.description}
        </p>
      )}
    </Card>
  );
});

SupportAgentNode.displayName = 'SupportAgentNode';
