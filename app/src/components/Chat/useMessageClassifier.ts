import { useMemo } from 'react';
import { HistoryEntry } from '../../types';
import { ClassifiedMessage, MessageGroup } from './types';

/**
 * Detect if a message is a warmup message (used for model prefetching)
 */
export function isWarmupMessage(message: string): boolean {
  return message?.includes('Warmup') ?? false;
}

/**
 * Detect if a message is a question or request requiring user input
 */
export function isQuestion(message: string, toolName?: string): boolean {
  // 1. Explicit tool detection (highest confidence)
  if (toolName === 'AskUserQuestion') return true;

  // 2. Pattern matching on message content
  const patterns = [
    /\?$/m,                                          // Ends with question mark
    /^(should|would|could|can|do|is|are|what|which|how|why|where|when)\s/im,
    /please (confirm|approve|review|decide|choose|provide|select)/i,
    /waiting for (your|input|response|approval|decision)/i,
    /let me know/i,
    /proceed\?/i,
    /\[Y\/n\]/i,                                     // CLI-style prompts
    /what would you like/i,
    /do you want me to/i,
  ];

  return patterns.some(p => p.test(message));
}

/**
 * Classify a single message entry
 */
function classifyEntry(entry: HistoryEntry): ClassifiedMessage {
  const { entry_type, message, tool_name } = entry;

  // Warmup messages are always secondary (collapsed)
  if (isWarmupMessage(message)) {
    return {
      entry,
      priority: 'secondary',
      isQuestion: false,
    };
  }

  // User messages are primary (visible) only if they have content
  if (entry_type === 'user') {
    const hasContent = message && message.trim().length > 0;
    if (!hasContent) {
      return {
        entry,
        priority: 'secondary',
        isQuestion: false,
      };
    }
    return {
      entry,
      priority: 'primary',
      isQuestion: false,
    };
  }

  // Assistant messages are primary (visible) only if they have content
  if (entry_type === 'assistant') {
    // Skip empty messages - they'll be collapsed instead
    const hasContent = message && message.trim().length > 0;
    if (!hasContent) {
      return {
        entry,
        priority: 'secondary',
        isQuestion: false,
      };
    }
    const questionDetected = isQuestion(message, tool_name);
    return {
      entry,
      priority: 'primary',
      isQuestion: questionDetected,
    };
  }

  // AskUserQuestion tool is primary (needs user response)
  if (entry_type === 'tool_use' && tool_name === 'AskUserQuestion') {
    return {
      entry,
      priority: 'primary',
      isQuestion: true,
    };
  }

  // Other tool calls and results are secondary (collapsible)
  if (entry_type === 'tool_use' || entry_type === 'tool_result') {
    return {
      entry,
      priority: 'secondary',
      isQuestion: false,
    };
  }

  // System messages - secondary (collapsible)
  return {
    entry,
    priority: 'secondary',
    isQuestion: false,
  };
}

/**
 * Generate summary for a collapsed group
 */
function generateGroupSummary(messages: ClassifiedMessage[]): string {
  const warmupMsgs = messages.filter(m => isWarmupMessage(m.entry.message));
  const nonWarmupMsgs = messages.filter(m => !isWarmupMessage(m.entry.message));

  // If all messages are warmup, show a simple warmup summary
  if (warmupMsgs.length > 0 && nonWarmupMsgs.length === 0) {
    return 'warmup';
  }

  const toolUses = nonWarmupMsgs.filter(m => m.entry.entry_type === 'tool_use');
  const toolResults = nonWarmupMsgs.filter(m => m.entry.entry_type === 'tool_result');
  const assistantMsgs = nonWarmupMsgs.filter(m => m.entry.entry_type === 'assistant');

  const parts: string[] = [];

  // If there are assistant messages (intermediate thinking), label as "agent activity"
  if (assistantMsgs.length > 0 && (toolUses.length > 0 || toolResults.length > 0)) {
    parts.push('agent activity');
  } else if (assistantMsgs.length > 0) {
    parts.push('thinking');
  }

  if (toolUses.length > 0) {
    // Group by tool name
    const toolCounts = toolUses.reduce((acc, m) => {
      const name = m.entry.tool_name || 'tool';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const toolSummary = Object.entries(toolCounts)
      .slice(0, 3)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ');

    parts.push(toolSummary);
    if (Object.keys(toolCounts).length > 3) {
      parts.push('...');
    }
  }

  if (toolResults.length > 0 && toolUses.length === 0) {
    parts.push(`${toolResults.length} result${toolResults.length > 1 ? 's' : ''}`);
  }

  // Add warmup indicator if mixed with other content
  if (warmupMsgs.length > 0 && nonWarmupMsgs.length > 0) {
    parts.push('warmup');
  }

  return parts.join(', ') || `${messages.length} items`;
}

/**
 * Group classified messages: consecutive secondary messages become collapsed groups
 */
function groupMessages(classified: ClassifiedMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentSecondary: ClassifiedMessage[] = [];
  let groupCounter = 0;

  const flushSecondary = () => {
    if (currentSecondary.length > 0) {
      const groupId = `collapsed-${groupCounter++}`;
      groups.push({
        id: groupId,
        type: 'collapsed',
        messages: currentSecondary.map(m => ({ ...m, groupId })),
        summary: generateGroupSummary(currentSecondary),
      });
      currentSecondary = [];
    }
  };

  for (const msg of classified) {
    if (msg.priority === 'primary') {
      flushSecondary();
      groups.push({
        id: `primary-${groupCounter++}`,
        type: 'primary',
        messages: [msg],
      });
    } else {
      currentSecondary.push(msg);
    }
  }

  // Flush any remaining secondary messages
  flushSecondary();

  return groups;
}

/**
 * Determine if an assistant message is a "final" response vs intermediate thinking.
 * Final responses are:
 * - Followed by a user message (they were the response to the user)
 * - The last assistant message when agent is not active (conversation paused)
 */
function isFinalAssistantMessage(
  entries: HistoryEntry[],
  index: number,
  isActive: boolean
): boolean {
  const entry = entries[index];
  if (entry.entry_type !== 'assistant') return false;

  // Check if followed by a user message (it was a final response)
  for (let i = index + 1; i < entries.length; i++) {
    const nextEntry = entries[i];
    if (nextEntry.entry_type === 'user' && nextEntry.message?.trim()) {
      return true;
    }
    // If we hit another assistant message before a user message, this wasn't final
    if (nextEntry.entry_type === 'assistant' && nextEntry.message?.trim()) {
      return false;
    }
  }

  // If agent is not active, the last assistant message with content is final
  if (!isActive) {
    // Check if this is the last assistant message with content
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.entry_type === 'assistant' && e.message?.trim()) {
        return i === index;
      }
    }
  }

  return false;
}

/**
 * Hook to classify and group messages for chat display
 * @param entries - The history entries to classify
 * @param isActive - Whether the agent is currently active/working
 */
export function useMessageClassifier(entries: HistoryEntry[], isActive: boolean = false): MessageGroup[] {
  return useMemo(() => {
    const classified = entries.map((entry, index) => {
      const base = classifyEntry(entry);

      // Override: collapse intermediate assistant messages
      if (entry.entry_type === 'assistant' && base.priority === 'primary') {
        if (!isFinalAssistantMessage(entries, index, isActive)) {
          return {
            ...base,
            priority: 'secondary' as const,
          };
        }
      }

      return base;
    });
    return groupMessages(classified);
  }, [entries, isActive]);
}

/**
 * Check if the agent is waiting for user input based on message state
 */
export function isWaitingForInput(entries: HistoryEntry[], isActive: boolean): boolean {
  if (isActive) return false; // Still actively working

  if (entries.length === 0) return false;

  const lastEntry = entries[entries.length - 1];

  // If last entry is an assistant message (not a tool call), likely waiting
  if (lastEntry.entry_type === 'assistant' && !lastEntry.tool_name) {
    return true;
  }

  // If last entry is from AskUserQuestion tool
  if (lastEntry.tool_name === 'AskUserQuestion') {
    return true;
  }

  return false;
}
