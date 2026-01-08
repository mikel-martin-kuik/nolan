import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ClassifiedMessage } from './types';
import { AskUserQuestionDisplay } from './AskUserQuestionDisplay';

interface ChatMessageProps {
  message: ClassifiedMessage;
  isLast: boolean;
  showNeedsResponse: boolean;
  /** Session name for interactive responses (e.g., "agent-ana") */
  session?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = memo(({
  message,
  isLast,
  showNeedsResponse,
  session,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUser = message.entry.entry_type === 'user';
  const isAskUserQuestion = message.entry.entry_type === 'tool_use' && message.entry.tool_name === 'AskUserQuestion';
  const { entry } = message;

  // Extract sender name and clean message text
  // Removes MSG_SENDER_ID prefix from display, keeping original for copy
  const getSenderAndMessage = (text: string) => {
    const msgMatch = text.match(/^MSG_([A-Z_]+)_[a-f0-9]+:\s*(.*)/s);
    if (msgMatch) {
      const sender = msgMatch[1];
      const cleanedText = msgMatch[2];
      return { sender, text: cleanedText };
    }
    return { sender: null, text };
  };

  const { sender, text: displayText } = getSenderAndMessage(entry.message);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    // Copy original message (with sender name but without MSG_ID)
    const textToCopy = sender ? `${sender}: ${displayText}` : entry.message;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'flex group',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 relative',
          isUser
            ? 'glass-message-user text-primary-foreground rounded-br-md'
            : 'glass-message rounded-bl-md',
          message.isQuestion && showNeedsResponse && 'ring-2 ring-yellow-500/50'
        )}
      >
        {/* Message content */}
        <div className={cn(
          'text-sm',
          isUser ? '' : isAskUserQuestion ? '' : 'prose prose-sm dark:prose-invert max-w-none'
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">
              {sender && <span className="font-semibold text-primary-foreground/80">{sender}: </span>}
              {displayText}
            </p>
          ) : isAskUserQuestion ? (
            <AskUserQuestionDisplay
              content={entry.message}
              showNeedsResponse={showNeedsResponse}
              isLast={isLast}
              session={session}
              interactive={!!session}
            />
          ) : (
            <>
              {sender && (
                <p className="font-semibold text-secondary-foreground/80 mb-2">
                  {sender}:
                </p>
              )}
              <ReactMarkdown
                components={{
                  // Compact styling for chat bubbles
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-black/20 px-1 py-0.5 rounded text-xs" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className={cn('block bg-black/30 p-2 rounded text-xs overflow-x-auto', className)} {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <pre className="bg-black/30 p-2 rounded overflow-x-auto my-2">{children}</pre>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                }}
              >
                {displayText}
              </ReactMarkdown>
            </>
          )}
        </div>

        {/* Needs response indicator - skip for AskUserQuestion as it has its own */}
        {showNeedsResponse && message.isQuestion && isLast && !isAskUserQuestion && (
          <div className="mt-2 flex items-center gap-1.5 text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Needs your response</span>
          </div>
        )}

        {/* Footer: timestamp and copy */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <span className={cn(
            'text-[10px]',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}>
            {entry.timestamp}
          </span>

          <button
            onClick={handleCopy}
            className={cn(
              'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
              isUser
                ? 'hover:bg-primary-foreground/10 text-primary-foreground/60'
                : 'hover:bg-secondary text-muted-foreground'
            )}
            title="Copy message"
          >
            {copied ? (
              <Check className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';
