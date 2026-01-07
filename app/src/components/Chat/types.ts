import { HistoryEntry } from '../../types';

export type MessagePriority = 'primary' | 'secondary';

export interface ClassifiedMessage {
  entry: HistoryEntry;
  priority: MessagePriority;
  isQuestion: boolean;
  groupId?: string; // For grouping consecutive secondary messages
}

export interface MessageGroup {
  id: string;
  type: 'primary' | 'collapsed';
  messages: ClassifiedMessage[];
  summary?: string; // For collapsed groups: "5 tool calls, 2 results"
}
