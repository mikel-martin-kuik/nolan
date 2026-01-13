import { useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@/lib/api';
import { listen } from '@/lib/events';
import { useFetchData } from './useFetchData';
import { usePollingEffect } from './usePollingEffect';
import { useWorkflowVisualizerStore } from '../store/workflowVisualizerStore';
import { useTeamStore } from '../store/teamStore';
import type {
  CronRunLog,
  CronOutputEvent,
  WorktreeListEntry,
  TeamConfig,
  PhaseConfig
} from '../types';
import type {
  ImplementationPipeline,
  PipelineStage,
  WorkflowNode,
  WorkflowEdge,
  PhaseNodeData,
  SupportAgentData
} from '../types/workflow';
import type { Pipeline } from '../types/generated/cronos/Pipeline';
import dagre from 'dagre';

const POLLING_INTERVAL = 10000; // 10 seconds

export interface UseWorkflowDataResult {
  pipelines: ImplementationPipeline[];
  worktrees: WorktreeListEntry[];
  teamConfig: TeamConfig | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWorkflowData(): UseWorkflowDataResult {
  const { currentTeamName } = useTeamStore();
  const setDagData = useWorkflowVisualizerStore((state) => state.setDagData);
  const setPipelines = useWorkflowVisualizerStore((state) => state.setPipelines);
  const updateNodeStatus = useWorkflowVisualizerStore((state) => state.updateNodeStatus);
  const viewMode = useWorkflowVisualizerStore((state) => state.viewMode);

  // Fetch pipelines from the new pipeline API
  const fetchPipelines = useCallback(async () => {
    try {
      const pipelines = await invoke<Pipeline[]>('list_pipelines', { status: null });
      // Convert backend Pipeline to frontend ImplementationPipeline
      return pipelines.map(convertPipelineToImplementationPipeline);
    } catch {
      // Fallback to empty array if pipeline API not available
      return [];
    }
  }, []);

  // Fetch run history (used for DAG visualization and fallback pipeline correlation)
  const fetchRunHistory = useCallback(async () => {
    return invoke<CronRunLog[]>('get_cron_run_history', { limit: 100 });
  }, []);

  // Fetch worktrees
  const fetchWorktrees = useCallback(async () => {
    return invoke<WorktreeListEntry[]>('list_worktrees');
  }, []);

  // Fetch team config
  const fetchTeamConfig = useCallback(async () => {
    if (!currentTeamName) return null;
    return invoke<TeamConfig>('get_team_config', { team_name: currentTeamName });
  }, [currentTeamName]);

  // Use fetch hooks
  const {
    data: pipelinesFromApi,
    loading: pipelinesLoading,
    refresh: refetchPipelines,
  } = useFetchData({
    fetcher: fetchPipelines,
    defaultValue: [],
    errorMessage: 'Failed to load pipelines',
  });

  const {
    data: runHistory,
    loading: runsLoading,
    error: runsError,
    refresh: refetchRuns,
  } = useFetchData({
    fetcher: fetchRunHistory,
    defaultValue: [],
    errorMessage: 'Failed to load run history',
  });

  const {
    data: worktrees,
    loading: worktreesLoading,
    refresh: refetchWorktrees,
  } = useFetchData({
    fetcher: fetchWorktrees,
    defaultValue: [],
    errorMessage: 'Failed to load worktrees',
  });

  const {
    data: teamConfig,
    loading: teamLoading,
    refresh: refetchTeam,
  } = useFetchData({
    fetcher: fetchTeamConfig,
    defaultValue: null,
    errorMessage: 'Failed to load team config',
  });

  // Use pipelines from API if available, otherwise fall back to correlation
  const pipelines = useMemo(() => {
    if (pipelinesFromApi.length > 0) {
      return pipelinesFromApi;
    }
    // Fallback: correlate from run history
    if (!runHistory.length) return [];
    return correlatePipelines(runHistory);
  }, [pipelinesFromApi, runHistory]);

  // DAG construction from team phases
  const { nodes, edges } = useMemo(() => {
    if (!teamConfig?.team?.workflow?.phases) {
      return { nodes: [], edges: [] };
    }
    return buildDagFromPhases(teamConfig.team.workflow, runHistory);
  }, [teamConfig, runHistory]);

  // Update store when data changes
  useEffect(() => {
    setDagData(nodes, edges);
  }, [nodes, edges, setDagData]);

  useEffect(() => {
    setPipelines(pipelines);
  }, [pipelines, setPipelines]);

  // Subscribe to cronos:output events for real-time updates
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    listen<CronOutputEvent>('cronos:output', (event) => {
      const { agent_name, event_type, content } = event.payload;

      if (event_type === 'status' && content === 'started') {
        updateNodeStatus(agent_name, 'running');
      } else if (event_type === 'complete') {
        updateNodeStatus(
          agent_name,
          content === 'success' ? 'success' : 'failed'
        );
      }
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [updateNodeStatus]);

  // Subscribe to pipeline events for real-time pipeline updates
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    const pipelineEvents = [
      'pipeline:created',
      'pipeline:updated',
      'pipeline:completed',
      'pipeline:failed',
      'pipeline:aborted',
    ];

    pipelineEvents.forEach((eventName) => {
      listen<Pipeline>(eventName, () => {
        refetchPipelines();
      }).then((unlisten) => {
        cleanups.push(unlisten);
      });
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [refetchPipelines]);

  // Polling when not in DAG view (DAG uses events primarily)
  usePollingEffect({
    interval: POLLING_INTERVAL,
    enabled: viewMode !== 'dag',
    callback: () => {
      refetchRuns();
      refetchWorktrees();
      refetchPipelines();
    },
  });

  const refetch = useCallback(() => {
    refetchRuns();
    refetchWorktrees();
    refetchTeam();
    refetchPipelines();
  }, [refetchRuns, refetchWorktrees, refetchTeam, refetchPipelines]);

  return {
    pipelines,
    worktrees,
    teamConfig,
    nodes,
    edges,
    isLoading: runsLoading || worktreesLoading || teamLoading || pipelinesLoading,
    error: runsError,
    refetch,
  };
}

// Helper: Correlate runs into pipelines
// Uses both worktree branch pattern and analyzer_run_id for correlation
function correlatePipelines(runs: CronRunLog[]): ImplementationPipeline[] {
  const pipelineMap = new Map<string, ImplementationPipeline>();

  // First pass: create pipelines from worktree branch patterns
  for (const run of runs) {
    // Extract correlation info from worktree branch pattern: worktree/{agent}/{run_id}
    const branchMatch = run.worktree_branch?.match(/worktree\/(\w+)\/(.+)/);
    if (!branchMatch) continue;

    const [, agentType, runId] = branchMatch;
    const pipelineId = run.session_name || runId;

    if (!pipelineMap.has(pipelineId)) {
      pipelineMap.set(pipelineId, {
        id: pipelineId,
        ideaId: pipelineId,
        ideaTitle: run.session_name || `Pipeline ${pipelineId.slice(0, 8)}`,
        worktreeBranch: run.worktree_branch,
        stages: [],
        createdAt: run.started_at,
        currentStage: 'implementer',
        overallStatus: 'in_progress',
      });
    }

    const pipeline = pipelineMap.get(pipelineId)!;
    addStageToPipeline(pipeline, run, agentType);
  }

  // Second pass: link analyzer runs using analyzer_verdict.analyzer_run_id
  for (const run of runs) {
    if (run.analyzer_verdict?.analyzer_run_id) {
      const analyzerRunId = run.analyzer_verdict.analyzer_run_id;

      // Find the pipeline that has this analyzer run
      for (const pipeline of pipelineMap.values()) {
        const analyzerStage = pipeline.stages.find(
          (s) => s.type === 'analyzer' && s.runId === analyzerRunId
        );

        if (analyzerStage) {
          // Link this run's pipeline to the analyzer's pipeline if different
          const currentPipelineId = run.session_name || run.run_id;
          if (currentPipelineId !== pipeline.id) {
            // Merge stages from the current run into the analyzer's pipeline
            const branchMatch = run.worktree_branch?.match(/worktree\/(\w+)\/.+/);
            if (branchMatch) {
              addStageToPipeline(pipeline, run, branchMatch[1]);
            }
          }
          break;
        }
      }
    }
  }

  // Finalize pipelines: sort stages and compute overall status
  for (const pipeline of pipelineMap.values()) {
    pipeline.stages.sort((a, b) =>
      new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime()
    );

    const lastStage = pipeline.stages[pipeline.stages.length - 1];
    pipeline.currentStage = lastStage?.type || 'implementer';

    if (lastStage?.status === 'failed') {
      pipeline.overallStatus = 'failed';
    } else if (lastStage?.type === 'merger' && lastStage?.status === 'success') {
      pipeline.overallStatus = 'completed';
    }
  }

  return Array.from(pipelineMap.values());
}

function addStageToPipeline(
  pipeline: ImplementationPipeline,
  run: CronRunLog,
  agentType: string
): void {
  // Check if stage already exists
  const existingStage = pipeline.stages.find(
    (s) => s.runId === run.run_id
  );
  if (existingStage) return;

  const stage: PipelineStage = {
    type: mapAgentToStageType(agentType),
    runId: run.run_id,
    agentName: run.agent_name,
    status: mapRunStatus(run.exit_code, run.completed_at),
    startedAt: run.started_at,
    completedAt: run.completed_at,
  };

  // Add verdict if analyzer
  if (run.analyzer_verdict) {
    stage.verdict = {
      outcome: run.analyzer_verdict.verdict || 'unknown',
      summary: run.analyzer_verdict.reason || '',
    };
  }

  pipeline.stages.push(stage);
}

function mapAgentToStageType(agent: string): PipelineStage['type'] {
  const lowerAgent = agent.toLowerCase();
  if (lowerAgent.includes('implement')) return 'implementer';
  if (lowerAgent.includes('analy')) return 'analyzer';
  if (lowerAgent.includes('qa')) return 'qa';
  if (lowerAgent.includes('merge')) return 'merger';
  return 'implementer';
}

function mapRunStatus(
  exitCode: number | null | undefined,
  completedAt: string | null | undefined
): PipelineStage['status'] {
  if (!completedAt) return 'running';
  if (exitCode === 0) return 'success';
  if (exitCode !== null && exitCode !== undefined) return 'failed';
  return 'pending';
}

// Helper: Build DAG from team workflow config
function buildDagFromPhases(
  workflow: { phases: PhaseConfig[]; note_taker?: string; exception_handler?: string },
  runHistory?: CronRunLog[] | null
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const { phases, note_taker, exception_handler } = workflow;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Helper to determine agent status from run history
  const getAgentStatus = (agentName: string): PhaseNodeData['status'] => {
    const agentRuns = runHistory?.filter((r) => r.agent_name === agentName) || [];
    const lastRun = agentRuns[0];
    if (lastRun && !lastRun.completed_at) return 'running';
    if (lastRun?.exit_code === 0) return 'success';
    if (lastRun?.exit_code) return 'failed';
    return 'idle';
  };

  // Create nodes from phases
  phases.forEach((phase, index) => {
    const nodeId = phase.name || `phase-${index}`;
    g.setNode(nodeId, { width: 180, height: 80 });

    nodes.push({
      id: nodeId,
      type: 'phaseNode',
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        phaseId: nodeId,
        phaseName: phase.name,
        ownerAgent: phase.owner,
        status: getAgentStatus(phase.owner),
        outputFile: phase.output,
        requires: phase.requires,
      },
    });

    // Create serial edge to next phase (sequential workflow)
    if (index < phases.length - 1) {
      const nextPhase = phases[index + 1];
      const nextNodeId = nextPhase.name || `phase-${index + 1}`;
      g.setEdge(nodeId, nextNodeId);
      edges.push({
        id: `${nodeId}-${nextNodeId}`,
        source: nodeId,
        target: nextNodeId,
        data: { isRejection: false },
      });
    }
  });

  // Apply dagre layout
  dagre.layout(g);

  // Update node positions from dagre
  let maxX = 0;
  let maxY = 0;
  nodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - 90, // Center based on width
        y: nodeWithPosition.y - 40, // Center based on height
      };
      maxX = Math.max(maxX, node.position.x + 180);
      maxY = Math.max(maxY, node.position.y + 80);
    }
  });

  // Add peripheral support agent nodes (positioned below the main pipeline)
  const supportAgentY = maxY + 60;
  const supportAgentStartX = maxX / 2 - 180; // Center the support agents

  if (note_taker) {
    const noteTakerData: SupportAgentData = {
      agentName: note_taker,
      role: 'note_taker',
      description: 'Documents workflow progress',
      status: getAgentStatus(note_taker),
    };
    nodes.push({
      id: 'support-note-taker',
      type: 'supportAgent',
      position: { x: supportAgentStartX, y: supportAgentY },
      data: noteTakerData,
    });
  }

  if (exception_handler) {
    const guardianData: SupportAgentData = {
      agentName: exception_handler,
      role: 'guardian',
      description: 'Handles workflow exceptions',
      status: getAgentStatus(exception_handler),
    };
    nodes.push({
      id: 'support-guardian',
      type: 'supportAgent',
      position: { x: supportAgentStartX + 180, y: supportAgentY },
      data: guardianData,
    });
  }

  return { nodes, edges };
}

// Helper: Convert backend Pipeline to frontend ImplementationPipeline
function convertPipelineToImplementationPipeline(pipeline: Pipeline): ImplementationPipeline {
  return {
    id: pipeline.id,
    ideaId: pipeline.idea_id,
    ideaTitle: pipeline.idea_title,
    worktreeBranch: pipeline.worktree_branch || undefined,
    createdAt: pipeline.created_at,
    currentStage: mapBackendStageType(pipeline.current_stage),
    overallStatus: mapBackendPipelineStatus(pipeline.status),
    stages: pipeline.stages.map((stage) => ({
      type: mapBackendStageType(stage.stage_type),
      runId: stage.run_id || undefined,
      agentName: stage.agent_name || undefined,
      status: mapBackendStageStatus(stage.status),
      startedAt: stage.started_at || undefined,
      completedAt: stage.completed_at || undefined,
      verdict: stage.verdict
        ? {
            outcome: stage.verdict.verdict || 'unknown',
            summary: stage.verdict.reason || '',
          }
        : undefined,
    })),
  };
}

function mapBackendStageType(stageType: string): PipelineStage['type'] {
  const mapping: Record<string, PipelineStage['type']> = {
    implementer: 'implementer',
    analyzer: 'analyzer',
    qa: 'qa',
    merger: 'merger',
  };
  return mapping[stageType] || 'implementer';
}

function mapBackendStageStatus(status: string): PipelineStage['status'] {
  const mapping: Record<string, PipelineStage['status']> = {
    pending: 'pending',
    running: 'running',
    success: 'success',
    failed: 'failed',
    skipped: 'skipped',
    blocked: 'failed', // Map blocked to failed for UI purposes
  };
  return mapping[status] || 'pending';
}

function mapBackendPipelineStatus(status: string): ImplementationPipeline['overallStatus'] {
  const mapping: Record<string, ImplementationPipeline['overallStatus']> = {
    created: 'in_progress',
    in_progress: 'in_progress',
    completed: 'completed',
    failed: 'failed',
    blocked: 'blocked',
    aborted: 'aborted',
  };
  return mapping[status] || 'in_progress';
}
