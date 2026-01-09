import React, { memo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '../../lib/utils';
import { useFreeAgentMessages } from '../../hooks/useFreeAgentMessages';
import { useAgentStore } from '../../store/agentStore';

// Circular progress component for context window usage
interface ContextProgressCircleProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
}

const ContextProgressCircle: React.FC<ContextProgressCircleProps> = ({
  value,
  size = 20,
  strokeWidth = 2.5,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const getColor = () => {
    if (value >= 60) return '#ef4444'; // red-500
    if (value >= 40) return '#eab308'; // yellow-500
    return '#22c55e'; // green-500
  };

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor()}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-300"
      />
    </svg>
  );
};

interface FreeAgentListItemProps {
  session: string;
  isSelected: boolean;
  onClick: () => void;
}

export const FreeAgentListItem: React.FC<FreeAgentListItemProps> = memo(({
  session,
  isSelected,
  onClick,
}) => {
  const agentState = useFreeAgentMessages(session);
  const { freeAgents } = useAgentStore();

  // Don't render if no state available
  if (!agentState) return null;

  const { agentName, isActive, isWorking, messages } = agentState;

  // Get context_usage from the agent store
  const agent = freeAgents.find((a) => a.session === session);
  const contextUsage = agent?.context_usage;

  // Get last message preview
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const lastMessagePreview = lastMessage
    ? lastMessage.preview || lastMessage.message?.slice(0, 50) || 'No content'
    : null;

  return (
    <Card
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`Select agent ${agentName}`}
      className={cn(
        'glass-card transition-all duration-200 rounded-xl',
        'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
        isActive ? 'glass-active' : 'opacity-80 hover:opacity-100',
        isSelected && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
      )}
    >
      <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={cn(
              'truncate',
              isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {agentName}
            </span>
            {/* Activity indicator */}
            {isWorking && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </CardTitle>

          {/* Context window progress circle */}
          {isActive && contextUsage !== undefined && (
            <ContextProgressCircle value={contextUsage} size={16} strokeWidth={2} />
          )}
        </div>

        <CardDescription className={cn(
          'text-[10px] sm:text-xs line-clamp-1',
          isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'
        )}>
          Free agent
        </CardDescription>
      </CardHeader>

      <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
        {/* Last message preview */}
        <div className="min-h-[16px]">
          {lastMessagePreview ? (
            <p className="text-[10px] text-muted-foreground/70 truncate">
              {lastMessagePreview}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground/50">
              {isActive ? 'No messages yet' : 'Agent inactive'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

FreeAgentListItem.displayName = 'FreeAgentListItem';
