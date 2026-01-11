import React, { useRef, useState, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Copy, Check, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HistoryEntry } from '../../types';
import { cn } from '../../lib/utils';
import { AskUserQuestionDisplay } from '../Chat/AskUserQuestionDisplay';

interface LiveMessageListProps {
  entries: HistoryEntry[];
  maxHeight?: string;
  /** Session name for interactive responses (e.g., "agent-ana") */
  session?: string;
}

// Memoized entry component to prevent unnecessary re-renders
interface MessageEntryProps {
  entry: HistoryEntry;
  index: number;
  isCopied: boolean;
  onCopy: (entry: HistoryEntry) => void;
  /** Session name for interactive responses */
  session?: string;
  /** Whether this is the last entry */
  isLast?: boolean;
}

const MessageEntry = React.memo<MessageEntryProps>(({
  entry,
  index,
  isCopied,
  onCopy,
  session,
  isLast = false,
}) => {
  const id = entry.uuid || `${entry.timestamp}-${index}`;
  const isAskUserQuestion = entry.entry_type === 'tool_use' && entry.tool_name === 'AskUserQuestion';

  return (
    <div
      key={id}
      className={cn(
        'group relative px-3 py-2 rounded-lg text-sm',
        isAskUserQuestion
          ? 'bg-yellow-500/10 ring-2 ring-yellow-500/50'
          : getEntryBgColor(entry.entry_type)
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-2">
          <span className={cn('font-medium', isAskUserQuestion ? 'text-yellow-400' : getEntryTextColor(entry.entry_type))}>
            {formatEntryType(entry.entry_type)}
          </span>
          {entry.tool_name && (
            <span className={cn('text-muted-foreground', isAskUserQuestion && 'text-yellow-400/80')}>
              ({entry.tool_name})
            </span>
          )}
          {isAskUserQuestion && (
            <span className="flex items-center gap-1 text-yellow-400">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs font-medium">Needs response</span>
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
      {isAskUserQuestion ? (
        <AskUserQuestionDisplay
          content={entry.message}
          showNeedsResponse={!session}
          isLast={isLast}
          session={session}
          interactive={!!session && isLast}
        />
      ) : entry.entry_type.toLowerCase() === 'assistant' ? (
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
  // Custom comparison: skip re-render if nothing changed
  // Return true = skip re-render, false = do re-render
  const shouldSkipRender = (
    prevProps.entry.uuid === nextProps.entry.uuid &&
    prevProps.entry.timestamp === nextProps.entry.timestamp &&
    prevProps.isCopied === nextProps.isCopied &&
    prevProps.session === nextProps.session &&
    prevProps.isLast === nextProps.isLast
  );
  return shouldSkipRender;
});

MessageEntry.displayName = 'MessageEntry';

export const LiveMessageList: React.FC<LiveMessageListProps> = ({
  entries,
  maxHeight = '300px',
  session,
}) => {
  const isFullHeight = maxHeight === '100%';
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async (entry: HistoryEntry) => {
    if (entry.message) {
      await navigator.clipboard.writeText(entry.message);
    }

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    const id = entry.uuid || entry.timestamp;
    setCopiedId(id);
    copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={entries}
      followOutput="smooth"
      overscan={30}
      className={cn('p-2', isFullHeight && 'h-full')}
      style={isFullHeight ? { height: '100%' } : { height: maxHeight }}
      itemContent={(index, entry) => {
        const id = entry.uuid || `${entry.timestamp}-${index}`;
        const isCopied = copiedId === id;
        const isLast = index === entries.length - 1;

        return (
          <div className="pb-1">
            <MessageEntry
              entry={entry}
              index={index}
              isCopied={isCopied}
              onCopy={handleCopy}
              session={session}
              isLast={isLast}
            />
          </div>
        );
      }}
    />
  );
};

function getEntryBgColor(_type: string): string {
  return 'bg-secondary/30';
}

function getEntryTextColor(_type: string): string {
  return 'text-muted-foreground';
}

function formatEntryType(type: string): string {
  return type.toUpperCase();
}

function truncateMessage(message: string | undefined | null, maxLength: number): string {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '...';
}
