import React, { memo } from 'react';
import { cn } from '../../lib/utils';

interface ChatActivityIndicatorProps {
  isActive: boolean;
  agentName: string;
  lastToolName?: string;
}

export const ChatActivityIndicator: React.FC<ChatActivityIndicatorProps> = memo(({
  isActive,
  agentName,
  lastToolName,
}) => {
  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      {/* Animated dots */}
      <div className="flex gap-1">
        <span
          className={cn(
            'w-2 h-2 rounded-full bg-primary animate-bounce',
            '[animation-delay:-0.3s]'
          )}
        />
        <span
          className={cn(
            'w-2 h-2 rounded-full bg-primary animate-bounce',
            '[animation-delay:-0.15s]'
          )}
        />
        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
      </div>

      {/* Status text */}
      <span className="capitalize">
        {agentName} is {lastToolName ? `using ${lastToolName}` : 'thinking'}...
      </span>
    </div>
  );
});

ChatActivityIndicator.displayName = 'ChatActivityIndicator';
