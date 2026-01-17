// Execution metrics types for workflow tracking

/**
 * Breakdown of executions by status
 */
export interface StatusBreakdown {
  success: number;
  failed: number;
  timeout: number;
  cancelled: number;
  running: number;
  skipped: number;
  interrupted: number;
}

/**
 * Breakdown of executions by trigger type
 */
export interface TriggerBreakdown {
  scheduled: number;
  manual: number;
  retry: number;
  catch_up: number;
}

/**
 * Common error pattern with count
 */
export interface ErrorSummary {
  error_type: string;
  count: number;
  last_seen: string;
  example_message?: string;
}

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

  // Status and trigger info
  status: string;
  trigger: string;
  exit_code?: number;
  error_message?: string;

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
  success_count: number;
  failure_count: number;
  success_rate: number;
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
  success_count: number;
  failure_count: number;
  success_rate: number;
  total_tokens: number;
  avg_tokens: number;
  total_cost: number;
  avg_cost: number;
  cost_per_success: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  rejection_count: number;
  retry_count: number;
  last_run_at?: string;
  last_status?: string;
}

/**
 * Project-level metrics summary
 */
export interface ProjectMetricsSummary {
  project_name: string;
  total_executions: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
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

  // Success/failure metrics
  success_count: number;
  failure_count: number;
  success_rate: number;
  cost_per_success: number;

  // Status and trigger breakdowns
  status_breakdown: StatusBreakdown;
  trigger_breakdown: TriggerBreakdown;

  // Error analysis
  top_errors: ErrorSummary[];

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
