import React, { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowDown, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HistoryEntry } from '../../types';
import { useMessageClassifier, isWaitingForInput, isWarmupMessage } from './useMessageClassifier';
import { ChatMessage } from './ChatMessage';
import { CollapsedActivity } from './CollapsedActivity';
import { ChatActivityIndicator } from './ChatActivityIndicator';

// Debounce helper for scroll handling
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Helper to extract display text from message (removes MSG_ID prefix)
function getDisplayText(message: string): string {
  const msgMatch = message.match(/^MSG_([A-Z_]+)_[a-f0-9]+:\s*(.*)/s);
  return msgMatch ? msgMatch[2] : message;
}

// Helper to truncate text with ellipsis
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// Component for pinned user messages summary
interface PinnedUserMessagesProps {
  firstMessage: HistoryEntry | null;
  lastMessage: HistoryEntry | null;
}

const PinnedUserMessages: React.FC<PinnedUserMessagesProps> = memo(({ firstMessage, lastMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!firstMessage) return null;

  const isSameMessage = firstMessage === lastMessage || !lastMessage;
  const firstText = getDisplayText(firstMessage.message);
  const lastText = lastMessage ? getDisplayText(lastMessage.message) : '';

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 text-left hover:bg-secondary/30 rounded-lg p-2 -m-2 transition-colors"
      >
        <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">Context</span>
            {isExpanded ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
          {isExpanded ? (
            <div className="space-y-2">
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">First</span>
                <p className="text-sm text-foreground whitespace-pre-wrap">{firstText}</p>
              </div>
              {!isSameMessage && (
                <div>
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Latest</span>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{lastText}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground truncate">
              {truncateText(firstText, 100)}
              {!isSameMessage && (
                <span className="text-muted-foreground"> ... {truncateText(lastText, 60)}</span>
              )}
            </p>
          )}
        </div>
      </button>
    </div>
  );
});

PinnedUserMessages.displayName = 'PinnedUserMessages';

interface ChatMessageListProps {
  entries: HistoryEntry[];
  isActive: boolean;
  agentName: string;
  /** Session name for interactive responses (e.g., "agent-ana") */
  session?: string;
  /** Map of entry index to agent info for team chat (agentName, agentColor) */
  agentInfo?: Map<number, { agentName: string; agentColor: string }>;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = memo(({
  entries,
  isActive,
  agentName,
  session,
  agentInfo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Classify and group messages (pass isActive to collapse intermediate messages)
  const groups = useMessageClassifier(entries, isActive);

  // Check if waiting for input
  const waitingForInput = isWaitingForInput(entries, isActive);

  // Extract first and last user messages for pinned context (excluding warmup messages)
  const { firstUserMessage, lastUserMessage } = useMemo(() => {
    const userMessages = entries.filter(e =>
      e.entry_type === 'user' &&
      e.message &&
      e.message.trim().length > 0 &&
      !isWarmupMessage(e.message)
    );
    if (userMessages.length === 0) {
      return { firstUserMessage: null, lastUserMessage: null };
    }
    return {
      firstUserMessage: userMessages[0],
      lastUserMessage: userMessages.length > 1 ? userMessages[userMessages.length - 1] : null,
    };
  }, [entries]);

  // Get last tool name for activity indicator
  const lastToolEntry = [...entries].reverse().find(e => e.entry_type === 'tool_use');
  const lastToolName = lastToolEntry?.tool_name;

  // Handle scroll position (debounced to reduce state updates)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleScroll = useCallback(
    debounce(() => {
      const container = containerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      setAutoScroll(isNearBottom);
      setShowScrollButton(!isNearBottom);
    }, 100),
    []
  );

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
    <div className="relative flex-1 overflow-hidden flex flex-col">
      {/* Pinned user messages context */}
      <PinnedUserMessages
        firstMessage={firstUserMessage}
        lastMessage={lastUserMessage}
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
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

            // Get agent info for team chat (find the original entry index)
            const entryIndex = entries.indexOf(msg.entry);
            const msgAgentInfo = agentInfo?.get(entryIndex);

            return (
              <ChatMessage
                key={group.id}
                message={msg}
                isLast={isPrimaryLast}
                showNeedsResponse={waitingForInput}
                session={session}
                agentName={msgAgentInfo?.agentName}
                agentColor={msgAgentInfo?.agentColor}
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
