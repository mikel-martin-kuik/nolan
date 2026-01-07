import React, { memo, useRef, useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HistoryEntry } from '../../types';
import { useMessageClassifier, isWaitingForInput } from './useMessageClassifier';
import { ChatMessage } from './ChatMessage';
import { CollapsedActivity } from './CollapsedActivity';
import { ChatActivityIndicator } from './ChatActivityIndicator';

interface ChatMessageListProps {
  entries: HistoryEntry[];
  isActive: boolean;
  agentName: string;
  /** Session name for interactive responses (e.g., "agent-ana") */
  session?: string;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = memo(({
  entries,
  isActive,
  agentName,
  session,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Classify and group messages
  const groups = useMessageClassifier(entries);

  // Check if waiting for input
  const waitingForInput = isWaitingForInput(entries, isActive);

  // Get last tool name for activity indicator
  const lastToolEntry = [...entries].reverse().find(e => e.entry_type === 'tool_use');
  const lastToolName = lastToolEntry?.tool_name;

  // Handle scroll position
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    setAutoScroll(isNearBottom);
    setShowScrollButton(!isNearBottom);
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollButton(false);
    }
  };

  // Count primary messages for "needs response" logic
  const primaryMessages = groups.filter(g => g.type === 'primary');
  const lastPrimaryIdx = primaryMessages.length - 1;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 space-y-3"
      >
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet
          </div>
        ) : (
          groups.map((group) => {
            if (group.type === 'collapsed') {
              return (
                <CollapsedActivity
                  key={group.id}
                  group={group}
                />
              );
            }

            // Primary message (single message in group)
            const msg = group.messages[0];
            const isPrimaryLast = primaryMessages.indexOf(group) === lastPrimaryIdx;

            return (
              <ChatMessage
                key={group.id}
                message={msg}
                isLast={isPrimaryLast}
                showNeedsResponse={waitingForInput}
                session={session}
              />
            );
          })
        )}

        {/* Activity indicator at bottom */}
        <ChatActivityIndicator
          isActive={isActive}
          agentName={agentName}
          lastToolName={lastToolName}
        />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-4 right-4 p-2 rounded-full',
            'bg-secondary border border-border shadow-lg',
            'hover:bg-secondary/80 transition-colors'
          )}
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

ChatMessageList.displayName = 'ChatMessageList';
