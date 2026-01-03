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
  ralph: 'Dummy',
};

export const AGENT_COLORS: Record<AgentName, string> = {
  ana: 'bg-agents-ana',    // Using semantic color system
  bill: 'bg-agents-bill',  // Using semantic color system
  carl: 'bg-agents-carl',  // Using semantic color system
  dan: 'bg-agents-dan',    // Using semantic color system (violet)
  enzo: 'bg-agents-enzo',  // Using semantic color system
  ralph: 'bg-agents-ralph', // Using semantic color system (zinc)
};

export const AGENT_TEXT_COLORS: Record<AgentName, string> = {
  ana: 'text-agents-ana',
  bill: 'text-agents-bill',
  carl: 'text-agents-carl',
  dan: 'text-agents-dan',
  enzo: 'text-agents-enzo',
  ralph: 'text-agents-ralph',
};


// History log types
export interface HistoryEntry {
  timestamp: string;
  agent: string | null;
  message: string;
  entry_type: string;
}
