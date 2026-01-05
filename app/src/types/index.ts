// Agent and session types matching Rust backend structures

export interface AgentStatus {
  name: string;
  active: boolean;
  session: string;
  attached: boolean;
  context_usage?: number;  // Context window usage percentage (0-100)
  current_project?: string;  // Current project from statusline (undefined if VIBING)
}

export interface AgentStatusList {
  core: AgentStatus[];
  spawned: AgentStatus[];  // Changed from string[] to AgentStatus[]
}

export type AgentName = 'ana' | 'bill' | 'carl' | 'dan' | 'enzo' | 'ralph';

export const VALID_AGENTS: AgentName[] = ['ana', 'bill', 'carl', 'dan', 'enzo', 'ralph'];

// Type guard for validating agent names at runtime
export const isValidAgentName = (name: string): name is AgentName => {
  return VALID_AGENTS.includes(name as AgentName);
};

export const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  ana: 'Researcher',
  bill: 'TechLead',
  carl: 'Developer',
  dan: 'Project Manager',
  enzo: 'QA',
  ralph: 'Free Agent',
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

// Claude Code model types
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export const CLAUDE_MODELS: { id: ClaudeModel; label: string; hint: string }[] = [
  { id: 'opus', label: 'Opus', hint: 'Powerful' },
  { id: 'sonnet', label: 'Sonnet', hint: 'Balanced' },
  { id: 'haiku', label: 'Haiku', hint: 'Fast' },
];


// History log types
export interface TokenInfo {
  input: number;
  output: number;
}

export interface HistoryEntry {
  uuid?: string;
  timestamp: string;
  agent?: string;
  tmux_session?: string;
  message: string;
  preview: string;
  entry_type: string;
  session_id?: string;
  project?: string;
  tool_name?: string;
  tokens?: TokenInfo;
  is_streaming?: boolean;  // true for real-time entries, false for bulk historical load
}
