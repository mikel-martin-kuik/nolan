// Agent and session types matching Rust backend structures

export interface AgentStatus {
  name: string;
  active: boolean;
  session: string;
  attached: boolean;
}

export interface AgentStatusList {
  core: AgentStatus[];
  spawned: string[];
}

export type AgentName = 'ana' | 'bill' | 'carl' | 'dan' | 'enzo' | 'ralph';

export const VALID_AGENTS: AgentName[] = ['ana', 'bill', 'carl', 'dan', 'enzo', 'ralph'];

export const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  ana: 'Research',
  bill: 'Planning',
  carl: 'Implementation',
  dan: 'Scrum Master',
  enzo: 'QA',
  ralph: 'Ralph (reserved)',
};

export const AGENT_COLORS: Record<AgentName, string> = {
  ana: 'bg-purple-500',
  bill: 'bg-blue-500',
  carl: 'bg-green-500',
  dan: 'bg-yellow-500',
  enzo: 'bg-red-500',
  ralph: 'bg-gray-500',
};

export const AGENT_TEXT_COLORS: Record<AgentName, string> = {
  ana: 'text-purple-400',
  bill: 'text-blue-400',
  carl: 'text-green-400',
  dan: 'text-yellow-400',
  enzo: 'text-red-400',
  ralph: 'text-gray-400',
};

// History log types
export interface HistoryEntry {
  timestamp: string;
  agent: string | null;
  message: string;
  entry_type: string;
}
