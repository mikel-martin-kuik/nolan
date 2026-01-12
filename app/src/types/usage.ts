export interface UsageEntry {
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  session_id: string;
  project_path: string;
}

export interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}

export interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

export interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

// Agent session stats types
export interface AgentSessionStats {
  session_id: string;
  tmux_session: string;
  original_prompt: string;
  start_time: string;
  end_time: string;
  duration_secs: number;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
}

export interface AgentStats {
  agent_name: string;
  total_sessions: number;
  total_cost: number;
  total_tokens: number;
  total_duration_secs: number;
  avg_cost_per_session: number;
  avg_duration_secs: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  sessions: AgentSessionStats[];
}
