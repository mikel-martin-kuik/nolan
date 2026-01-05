import React, { useRef, useMemo } from 'react';
import { List, ListImperativeAPI, RowComponentProps } from 'react-window';
import { LogEntry } from '../History/LogEntry';
import { HistoryEntry } from '../../types';
import { TokenUsage } from '../../types/sessions';
import { ChevronDown, Pause, Play } from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

/**
 * Calculate cost from token counts using Anthropic Sonnet 4.5 pricing
 * - Input: $0.003 per 1000 tokens
 * - Output: $0.015 per 1000 tokens
 */
const calculateTokenCost = (inputTokens: number, outputTokens: number): number => {
  return (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);
};

interface SessionCardProps {
  sessionId: string;
  sessionName: string;
  entries: HistoryEntry[];
  isExpanded: boolean;
  isCollapsible?: boolean;
  onToggle?: () => void;
  onSelectEntry?: (entry: HistoryEntry) => void;
  selectedEntryUuid?: string | null;
  useVirtualization?: boolean;
  autoScrollEnabled?: boolean;
  listRef?: React.MutableRefObject<Map<string, ListImperativeAPI>>;
  containerRef?: React.MutableRefObject<Map<string, HTMLDivElement>>;
  // NEW PROPS
  agentStatus: 'active' | 'idle' | 'offline';  // REQUIRED - always computed in Phase 6.4
  tmuxSession?: string | null;
  onToggleAutoScroll?: (sessionId: string) => void;
  fullSessionStats?: TokenUsage;  // Full session token usage from backend (includes all historical entries)
  lastActivityTime?: string;  // Last activity timestamp for offline sessions
}

export const SessionCard: React.FC<SessionCardProps> = ({
  sessionId,
  sessionName,
  entries,
  isExpanded,
  isCollapsible = true,
  onToggle,
  onSelectEntry,
  selectedEntryUuid,
  useVirtualization = false,
  autoScrollEnabled = false,
  listRef,
  containerRef,
  agentStatus,
  onToggleAutoScroll,
  fullSessionStats,
  lastActivityTime,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Calculate total tokens and cost for all entries in this session
  // Prefer fullSessionStats (complete history) over calculating from visible entries
  const sessionStats = useMemo(() => {
    if (fullSessionStats) {
      // Use full session stats from backend (includes ALL historical entries)
      return {
        inputTokens: fullSessionStats.input_tokens,
        outputTokens: fullSessionStats.output_tokens,
        totalTokens: fullSessionStats.input_tokens + fullSessionStats.output_tokens,
        cost: fullSessionStats.total_cost,
      };
    }

    // Fallback: calculate from visible entries only
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    entries.forEach(entry => {
      if (entry.tokens) {
        totalInputTokens += entry.tokens.input;
        totalOutputTokens += entry.tokens.output;
      }
    });

    const totalCost = calculateTokenCost(totalInputTokens, totalOutputTokens);

    return {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      cost: totalCost,
    };
  }, [entries, fullSessionStats]);

  // Fixed row height for virtualization
  const getRowHeight = (): number => 34;

  // Row component factory for virtualized list
  const createRowComponent = () => {
    return ({ index, style }: RowComponentProps<Record<string, never>>) => (
      <div style={{ ...style, paddingBottom: '6px' }}>
        <LogEntry
          entry={entries[index]}
          onSelect={() => onSelectEntry?.(entries[index])}
          isSelected={selectedEntryUuid === entries[index]?.uuid}
        />
      </div>
    );
  };

  // Auto-scroll effect for non-virtualized mode
  React.useEffect(() => {
    if (!useVirtualization && autoScrollEnabled && isExpanded && entries.length > 0 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, autoScrollEnabled, isExpanded, useVirtualization]);

  // Auto-scroll to last message when expanding
  React.useEffect(() => {
    if (isExpanded && entries.length > 0) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        if (!useVirtualization && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        } else if (useVirtualization && listRef) {
          const sessionRef = listRef.current.get(sessionId);
          if (sessionRef) {
            sessionRef.scrollToRow({ index: entries.length - 1, align: 'end' });
          }
        }
      }, 100);
    }
  }, [isExpanded]);

  const handleCardClick = () => {
    if (isCollapsible && !isExpanded && onToggle) {
      onToggle();
    }
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    if (isCollapsible && isExpanded && onToggle) {
      e.stopPropagation();
      onToggle();
    }
  };

  const handleToggleAutoScroll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleAutoScroll) {
      onToggleAutoScroll(sessionId);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`glass-card rounded-2xl flex flex-col overflow-hidden transition-all duration-200 ${
        isExpanded ? 'h-[250px]' : 'min-h-[auto] cursor-pointer'
      }`}
    >
      {/* Session header */}
      <div
        onClick={handleHeaderClick}
        className={`group/header flex items-center justify-between px-4 py-3 flex-shrink-0 relative bg-secondary/30 ${
          isCollapsible && isExpanded ? 'cursor-pointer' : ''
        }`}
      >
        {/* Left side: Status + Name + Count */}
        <div className="flex items-center gap-2">
          {isCollapsible && (
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isExpanded ? 'rotate-0' : '-rotate-90'
              }`}
            />
          )}

          {/* Status dot - always rendered since agentStatus is required */}
          <Tooltip
            content={
              agentStatus === 'active'
                ? 'Agent is actively working'
                : agentStatus === 'idle'
                ? 'Agent is online but inactive'
                : 'Agent is offline'
            }
            side="bottom"
          >
            <div className={`w-2 h-2 rounded-full ${
              agentStatus === 'active'
                ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50'
                : agentStatus === 'idle'
                ? 'bg-yellow-500 shadow-md shadow-yellow-500/30'
                : 'bg-gray-400'
            }`} />
          </Tooltip>

          <span className="text-sm font-semibold text-foreground capitalize">
            {sessionName}
          </span>

          {/* Show different info for offline vs active/idle sessions */}
          {agentStatus === 'offline' ? (
            <>
              {lastActivityTime && (
                <span className="text-xs text-muted-foreground">
                  Last active: {lastActivityTime}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {entries.length} messages
              </span>
              {sessionStats.totalTokens > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <Tooltip
                    content={`Input: ${sessionStats.inputTokens.toLocaleString()} | Output: ${sessionStats.outputTokens.toLocaleString()}`}
                    side="bottom"
                  >
                    <span className="text-xs text-muted-foreground font-mono">
                      {sessionStats.totalTokens.toLocaleString()} tokens
                    </span>
                  </Tooltip>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-emerald-400 font-mono">
                    ${sessionStats.cost.toFixed(4)}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Right side: Controls (appear on hover) */}
        <div className="flex items-center gap-1">
          {/* Auto-scroll toggle */}
          {onToggleAutoScroll && (
            <Tooltip content={autoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'} side="bottom">
              <button
                onClick={handleToggleAutoScroll}
                className="opacity-0 group-hover/header:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label={autoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'}
              >
                {autoScrollEnabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Log area - only shown when expanded */}
      {isExpanded && (
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-secondary/30 p-2"
          ref={(el) => {
            if (el && containerRef) {
              containerRef.current.set(sessionId, el);
            }
          }}
        >
          {useVirtualization ? (
            <List
              listRef={(ref) => {
                if (ref && listRef) {
                  listRef.current.set(sessionId, ref);
                }
              }}
              defaultHeight={containerRef?.current.get(sessionId)?.clientHeight || 300}
              rowCount={entries.length}
              rowHeight={getRowHeight}
              rowComponent={createRowComponent()}
              rowProps={{}}
              style={{ padding: '8px 4px', overflowX: 'hidden' }}
            />
          ) : (
            <>
              {entries.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-sm">
                    No messages yet
                  </p>
                </div>
              ) : (
                <>
                  {entries.map((entry, index) => (
                    <div key={entry.uuid || `${entry.timestamp}-${index}`} style={{ paddingBottom: '6px' }}>
                      <LogEntry
                        entry={entry}
                        onSelect={() => onSelectEntry?.(entry)}
                        isSelected={selectedEntryUuid === entry.uuid}
                      />
                    </div>
                  ))}
                  {/* Invisible div to scroll to */}
                  <div ref={bottomRef} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
