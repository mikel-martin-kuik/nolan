/**
 * Feedback and feature request types
 */

export type FeatureRequestStatus = 'new' | 'reviewed' | 'designed' | 'done' | 'rejected';

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  votes: number;
  created_at: string;
  updated_at: string;
  author?: string;
}

export type IdeaStatus = 'active' | 'archived';

export interface Idea {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  created_at: string;
  updated_at?: string;
  created_by?: string;
}

export interface FeedbackStats {
  total_requests: number;
  by_status: Record<string, number>;
  total_votes: number;
  total_ideas: number;
}

// Status display helpers
export const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  designed: 'Designed',
  done: 'Done',
  rejected: 'Rejected',
};

export const STATUS_COLORS: Record<FeatureRequestStatus, string> = {
  new: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  reviewed: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  designed: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  done: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

// Idea review types (from cron-inbox-digest agent)
export type IdeaReviewStatus = 'draft' | 'needs_input' | 'ready' | 'rejected';
export type IdeaComplexity = 'low' | 'medium' | 'high';

// Agent's proposed enhanced version of the idea
export interface IdeaProposal {
  title: string;
  summary: string;
  problem: string;
  solution: string;
  scope?: string;
  implementation_hints?: string;
}

// A gap that needs user input
export interface IdeaGap {
  id: string;
  label: string;
  description: string;
  placeholder?: string;
  value?: string;
  required: boolean;
}

export interface IdeaReview {
  item_id: string;
  item_type: 'idea' | 'request';
  review_status: IdeaReviewStatus;
  // Agent's enhanced proposal
  proposal: IdeaProposal;
  // Identified gaps that need user input
  gaps: IdeaGap[];
  // Agent's analysis notes
  analysis: string;
  complexity?: IdeaComplexity;
  reviewed_at: string;
  updated_at?: string;
  // User accepted the proposal
  accepted_at?: string;
}

export const REVIEW_STATUS_LABELS: Record<IdeaReviewStatus, string> = {
  draft: 'Draft Proposal',
  needs_input: 'Needs Your Input',
  ready: 'Ready',
  rejected: 'Not Feasible',
};

export const REVIEW_STATUS_COLORS: Record<IdeaReviewStatus, string> = {
  draft: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  needs_input: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  ready: 'bg-green-500/10 text-green-500 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export const COMPLEXITY_LABELS: Record<IdeaComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const COMPLEXITY_COLORS: Record<IdeaComplexity, string> = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

// Design decision tracking types
export type DecisionStatus = 'proposed' | 'in_review' | 'approved' | 'deprecated' | 'superseded';

export interface TeamDecision {
  id: string;
  team_id: string;
  agent_id?: string;
  title: string;
  problem: string;
  proposed_solution: string;
  alternatives: string[];
  rationale: string;
  impact: string;
  scope: string;
  status: DecisionStatus;
  approved_by?: string;
  created_at: string;
  approved_at?: string;
  deprecated_at?: string;
  superseded_by?: string;
}

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  in_review: 'In Review',
  approved: 'Approved',
  deprecated: 'Deprecated',
  superseded: 'Superseded',
};

export const DECISION_STATUS_COLORS: Record<DecisionStatus, string> = {
  proposed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  in_review: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  approved: 'bg-green-500/10 text-green-500 border-green-500/20',
  deprecated: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  superseded: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};
