export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
}

export interface Session {
  session_id: string;
  summary: string;
  first_timestamp: string;
  last_timestamp: string;
  message_count: number;
  token_usage: TokenUsage;
  cwd?: string;
  agents: string[];
}

export interface MessageContent {
  content: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  timestamp?: string;
  tokens?: TokenUsage;
  tool_name?: string;
}

export interface SessionDetail {
  session: Session;
  messages: MessageContent[];
}

export interface PaginatedSessions {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface SearchMatch {
  session_id: string;
  session_summary: string;
  message_index: number;
  message_type: string;
  excerpt: string;
  match_position: number;
  timestamp?: string;
}

export interface SearchResults {
  query: string;
  total_matches: number;
  matches: SearchMatch[];
}
