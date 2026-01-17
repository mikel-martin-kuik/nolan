// Decision types for team design decisions tracking

export type DecisionStatus = 'proposed' | 'in_review' | 'approved' | 'deprecated' | 'superseded';

export interface TeamDecision {
  id: string;
  team_id: string;
  agent_id: string | null;
  title: string;
  problem: string;
  proposed_solution: string;
  alternatives: string[];
  rationale: string | null;
  impact: string | null;
  scope: string | null;
  status: DecisionStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  in_review: 'In Review',
  approved: 'Approved',
  deprecated: 'Deprecated',
  superseded: 'Superseded',
};

export const DECISION_STATUS_COLORS: Record<DecisionStatus, string> = {
  proposed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  deprecated: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  superseded: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};
