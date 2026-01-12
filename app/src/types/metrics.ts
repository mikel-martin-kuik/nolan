// Execution metrics types for workflow tracking

/**
 * Quantitative metrics automatically captured per workflow execution
 */
export interface ExecutionMetrics {
  execution_id: string;
  project_name: string;
  workflow_name?: string;
  started_at: string;
  ended_at?: string;
  duration_secs: number;

  // Token metrics
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;

  // Execution metrics
  agent_count: number;
  phase_count: number;
  rejection_count: number;
  retry_count: number;

  // Cost
  cost_usd: number;

  // Quality scores (optional, AI-evaluated)
  prompt_quality_score?: number;
  output_quality_score?: number;
  quality_evaluated_at?: string;
  quality_model?: string;
}

/**
 * Daily aggregated metrics for trend visualization
 */
export interface DailyMetrics {
  date: string;
  execution_count: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  total_tokens: number;
  total_cost: number;
  avg_cost: number;
  avg_agent_count: number;
  avg_phase_count: number;
  total_rejections: number;
  total_retries: number;

  // Average quality scores (when available)
  avg_prompt_quality?: number;
  avg_output_quality?: number;
  quality_sample_count?: number;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  agent_name: string;
  execution_count: number;
  total_tokens: number;
  avg_tokens: number;
  total_cost: number;
  avg_cost: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  rejection_count: number;
  retry_count: number;
}

/**
 * Project-level metrics summary
 */
export interface ProjectMetricsSummary {
  project_name: string;
  total_executions: number;
  total_tokens: number;
  total_cost: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  avg_cost: number;
  avg_agents_per_execution: number;
  avg_phases_per_execution: number;
  first_execution_at: string;
  last_execution_at: string;

  // Quality metrics (when available)
  avg_prompt_quality?: number;
  avg_output_quality?: number;
}

/**
 * Overall metrics dashboard data
 */
export interface MetricsDashboard {
  // Summary stats
  total_executions: number;
  total_tokens: number;
  total_cost: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  avg_cost_per_execution: number;

  // Trend data
  daily_metrics: DailyMetrics[];

  // Breakdowns
  by_project: ProjectMetricsSummary[];
  by_agent: AgentPerformanceMetrics[];

  // Recent executions
  recent_executions: ExecutionMetrics[];
}

/**
 * Quality evaluation request for AI scoring
 */
export interface QualityEvaluationRequest {
  execution_id: string;
  prompt: string;
  output: string;
}

/**
 * Quality evaluation result from AI
 */
export interface QualityEvaluationResult {
  execution_id: string;
  prompt_quality_score: number;
  output_quality_score: number;
  prompt_feedback?: string;
  output_feedback?: string;
  evaluated_at: string;
  model: string;
}
