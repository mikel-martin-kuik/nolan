import React, { memo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MessageGroup } from './types';

interface CollapsedActivityProps {
  group: MessageGroup;
  defaultExpanded?: boolean;
}

export const CollapsedActivity: React.FC<CollapsedActivityProps> = memo(({
  group,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full py-2 px-3 rounded-lg text-xs transition-colors flex items-center gap-2',
          'bg-muted/30 hover:bg-muted/50 text-muted-foreground',
          expanded && 'bg-muted/50'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{group.summary}</span>
        <span className="ml-auto text-muted-foreground/60">
          {group.messages.length} {group.messages.length === 1 ? 'item' : 'items'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-4 border-l-2 border-muted/50">
          {group.messages.map((msg, idx) => (
            <div
              key={`${msg.entry.timestamp}-${idx}`}
              className="text-xs bg-muted/20 rounded-lg p-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
                  msg.entry.entry_type === 'tool_use' && 'bg-blue-500/20 text-blue-400',
                  msg.entry.entry_type === 'tool_result' && 'bg-green-500/20 text-green-400',
                  msg.entry.entry_type === 'assistant' && 'bg-purple-500/20 text-purple-400',
                  msg.entry.entry_type === 'system' && 'bg-zinc-500/20 text-zinc-400',
                )}>
                  {msg.entry.entry_type}
                </span>
                {msg.entry.tool_name && (
                  <span className="text-muted-foreground font-mono">
                    {msg.entry.tool_name}
                  </span>
                )}
                <span className="ml-auto text-muted-foreground/60">
                  {msg.entry.timestamp}
                </span>
              </div>
              <div className="text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {msg.entry.preview || msg.entry.message.slice(0, 200)}
                {msg.entry.message.length > 200 && '...'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

CollapsedActivity.displayName = 'CollapsedActivity';
