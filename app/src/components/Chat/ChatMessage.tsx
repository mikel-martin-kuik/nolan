import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ClassifiedMessage } from './types';

interface ChatMessageProps {
  message: ClassifiedMessage;
  isLast: boolean;
  showNeedsResponse: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = memo(({
  message,
  isLast,
  showNeedsResponse,
}) => {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.entry.entry_type === 'user';
  const { entry } = message;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(entry.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-secondary/80 rounded-bl-md',
          message.isQuestion && showNeedsResponse && 'ring-2 ring-yellow-500/50 bg-yellow-500/10'
        )}
      >
        {/* Message content */}
        <div className={cn(
          'text-sm',
          isUser ? '' : 'prose prose-sm dark:prose-invert max-w-none'
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{entry.message}</p>
          ) : (
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
              {entry.message}
            </ReactMarkdown>
          )}
        </div>

        {/* Needs response indicator */}
        {showNeedsResponse && message.isQuestion && isLast && (
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
