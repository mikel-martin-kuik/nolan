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
