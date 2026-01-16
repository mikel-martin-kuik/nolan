import type { Node, Edge } from '@xyflow/react';

// DAG Node Types
export type PhaseNodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'blocked';

export interface PhaseNodeData extends Record<string, unknown> {
  phaseId: string;
  phaseName: string;
  ownerAgent: string;
  status: PhaseNodeStatus;
  outputFile?: string;
  requires?: string[];
}

export interface AgentAvatarData extends Record<string, unknown> {
  agentName: string;
  isRunning: boolean;
  lastRunStatus?: 'success' | 'failed';
}

export interface SupportAgentData extends Record<string, unknown> {
  agentName: string;
  role: 'note_taker' | 'guardian';
  description: string;
  status: PhaseNodeStatus;
}

export type PhaseNode = Node<PhaseNodeData, 'phaseNode'>;
export type AgentAvatarNode = Node<AgentAvatarData, 'agentAvatar'>;
export type SupportAgentNode = Node<SupportAgentData, 'supportAgent'>;
export type WorkflowNode = PhaseNode | AgentAvatarNode | SupportAgentNode;
export type WorkflowEdge = Edge<{ isRejection?: boolean; animated?: boolean }>;

// Pipeline Types
export type PipelineStageType = 'idea' | 'implementer' | 'analyzer' | 'merger';

export interface PipelineStage {
  type: PipelineStageType;
  runId?: string;
  agentName?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  verdict?: {
    outcome: string;
    summary: string;
  };
}

export interface ImplementationPipeline {
  id: string;
  ideaId: string;
  ideaTitle: string;
  worktreeBranch?: string;
  stages: PipelineStage[];
  createdAt: string;
  currentStage: PipelineStageType;
  overallStatus: 'in_progress' | 'completed' | 'failed' | 'blocked' | 'aborted';
}

// View State Types
export type WorkflowViewMode = 'dag' | 'pipelines' | 'worktrees';

export interface WorkflowVisualizerState {
  viewMode: WorkflowViewMode;
  selectedPipelineId: string | null;
  selectedPhaseId: string | null;
  dagNodes: WorkflowNode[];
  dagEdges: WorkflowEdge[];
  pipelines: ImplementationPipeline[];
  isLoading: boolean;
  error: string | null;
}
