import React, { memo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '../../lib/utils';
import { useTeamMessages } from '../../hooks/useTeamMessages';
import type { TeamConfig } from '../../types';

interface TeamListItemProps {
  teamName: string;
  teamConfig: TeamConfig | undefined;
  isSelected: boolean;
  onClick: () => void;
}

export const TeamListItem: React.FC<TeamListItemProps> = memo(({
  teamName,
  teamConfig,
  isSelected,
  onClick,
}) => {
  const teamState = useTeamMessages(teamName);

  const description = teamConfig?.team.description || 'Team';
  const memberCount = teamConfig?.team.agents.length || 0;
  const activeCount = teamState?.activeAgentCount || 0;
  const isAnyWorking = teamState?.isAnyAgentWorking || false;

  // Get last message preview
  const lastMessage = teamState?.messages.length
    ? teamState.messages[teamState.messages.length - 1]
    : null;

  const lastMessagePreview = lastMessage
    ? `${lastMessage.agentName}: ${lastMessage.preview || lastMessage.message?.slice(0, 40) || 'No content'}`
    : null;

  // Format team name for display
  const displayName = teamName.charAt(0).toUpperCase() + teamName.slice(1);

  return (
    <Card
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`Select team ${displayName}`}
      className={cn(
        'glass-card transition-all duration-200 rounded-xl',
        'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
        activeCount > 0 ? 'glass-active' : 'opacity-80 hover:opacity-100',
        isSelected && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
      )}
    >
      <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={cn(
              'truncate',
              activeCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {displayName}
            </span>
            {/* Activity indicator */}
            {isAnyWorking && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </CardTitle>

          {/* Member count badge */}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full',
            activeCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {activeCount}/{memberCount}
          </span>
        </div>

        <CardDescription className={cn(
          'text-[10px] sm:text-xs line-clamp-1',
          activeCount > 0 ? 'text-muted-foreground' : 'text-muted-foreground/60'
        )}>
          {description}
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
              {activeCount > 0 ? 'No messages yet' : 'Team inactive'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

TeamListItem.displayName = 'TeamListItem';
