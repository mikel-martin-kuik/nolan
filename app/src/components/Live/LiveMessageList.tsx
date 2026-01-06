import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HistoryEntry } from '../../types';
import { useLiveOutputStore } from '../../store/liveOutputStore';
import { cn } from '../../lib/utils';

interface LiveMessageListProps {
  entries: HistoryEntry[];
  maxHeight?: string;
}

// Memoized entry component to prevent unnecessary re-renders
interface MessageEntryProps {
  entry: HistoryEntry;
  index: number;
  isCopied: boolean;
  onCopy: (entry: HistoryEntry) => void;
}

const MessageEntry = React.memo<MessageEntryProps>(({
  entry,
  index,
  isCopied,
  onCopy,
}) => {
  const id = entry.uuid || `${entry.timestamp}-${index}`;

  return (
    <div
      key={id}
      className={cn(
        'group relative px-3 py-2 rounded-lg text-sm',
        getEntryBgColor(entry.entry_type)
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-2">
          <span className={cn('font-medium', getEntryTextColor(entry.entry_type))}>
            {formatEntryType(entry.entry_type)}
          </span>
          {entry.tool_name && (
            <span className="text-muted-foreground">
              ({entry.tool_name})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry.tokens && (
            <span className="text-muted-foreground font-mono">
              {entry.tokens.input + entry.tokens.output} tok
            </span>
          )}
          <span className="text-muted-foreground font-mono">
            {entry.timestamp}
          </span>
        </div>
      </div>

      {/* Message content */}
      {entry.entry_type.toLowerCase() === 'assistant' ? (
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-code:text-xs">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {truncateMessage(entry.message, 2000)}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="font-mono text-xs whitespace-pre-wrap break-words text-foreground/90">
          {truncateMessage(entry.message, 500)}
        </div>
      )}

      {/* Copy button (visible on hover) */}
      <button
        onClick={() => onCopy(entry)}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 bg-background/80 hover:bg-background transition-all"
      >
        {isCopied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if entry or copy state changed
  return (
    prevProps.entry.uuid === nextProps.entry.uuid &&
    prevProps.entry.timestamp === nextProps.entry.timestamp &&
    prevProps.isCopied === nextProps.isCopied
  );
});

MessageEntry.displayName = 'MessageEntry';

export const LiveMessageList: React.FC<LiveMessageListProps> = ({
  entries,
  maxHeight = '300px',
}) => {
  const isFullHeight = maxHeight === '100%';
  const { autoScroll } = useLiveOutputStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Debounced auto-scroll to prevent excessive updates
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce scroll to avoid jank during rapid updates
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [entries.length, autoScroll]);

  const handleCopy = useCallback(async (entry: HistoryEntry) => {
    if (entry.message) {
      await navigator.clipboard.writeText(entry.message);
    }
    const id = entry.uuid || entry.timestamp;
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-y-auto space-y-1 p-2',
        isFullHeight && 'h-full'
      )}
      style={isFullHeight ? undefined : { maxHeight }}
    >
      {entries.map((entry, index) => {
        const id = entry.uuid || `${entry.timestamp}-${index}`;
        const isCopied = copiedId === id;

        return (
          <MessageEntry
            key={id}
            entry={entry}
            index={index}
            isCopied={isCopied}
            onCopy={handleCopy}
          />
        );
      })}
    </div>
  );
};

function getEntryBgColor(_type: string): string {
  return 'bg-secondary/30';
}

function getEntryTextColor(_type: string): string {
  return 'text-muted-foreground';
}

function formatEntryType(type: string): string {
  switch (type.toLowerCase()) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool_use':
      return 'Tool';
    case 'tool_result':
      return 'Result';
    case 'system':
      return 'System';
    default:
      return type;
  }
}

function truncateMessage(message: string | undefined | null, maxLength: number): string {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '...';
}
