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
  PhaseNodeData
} from '../types/workflow';
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

  // Fetch run history
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

  // Pipeline correlation logic
  const pipelines = useMemo(() => {
    if (!runHistory.length) return [];
    return correlatePipelines(runHistory);
  }, [runHistory]);

  // DAG construction from team phases
  const { nodes, edges } = useMemo(() => {
    if (!teamConfig?.team?.workflow?.phases) {
      return { nodes: [], edges: [] };
    }
    return buildDagFromPhases(teamConfig.team.workflow.phases, runHistory);
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

  // Polling when not in DAG view (DAG uses events primarily)
  usePollingEffect({
    interval: POLLING_INTERVAL,
    enabled: viewMode !== 'dag',
    callback: () => {
      refetchRuns();
      refetchWorktrees();
    },
  });

  const refetch = useCallback(() => {
    refetchRuns();
    refetchWorktrees();
    refetchTeam();
  }, [refetchRuns, refetchWorktrees, refetchTeam]);

  return {
    pipelines,
    worktrees,
    teamConfig,
    nodes,
    edges,
    isLoading: runsLoading || worktreesLoading || teamLoading,
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

// Helper: Build DAG from team phases (using proper PhaseConfig type)
function buildDagFromPhases(
  phases: PhaseConfig[],
  runHistory?: CronRunLog[] | null
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Create nodes from phases
  phases.forEach((phase, index) => {
    const nodeId = phase.name || `phase-${index}`;
    g.setNode(nodeId, { width: 180, height: 80 });

    // Determine status from recent runs
    const agentRuns = runHistory?.filter((r) => r.agent_name === phase.owner) || [];
    const lastRun = agentRuns[0];
    let status: PhaseNodeData['status'] = 'idle';
    if (lastRun && !lastRun.completed_at) status = 'running';
    else if (lastRun?.exit_code === 0) status = 'success';
    else if (lastRun?.exit_code) status = 'failed';

    nodes.push({
      id: nodeId,
      type: 'phaseNode',
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        phaseId: nodeId,
        phaseName: phase.name,
        ownerAgent: phase.owner,
        status,
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
  nodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - 90, // Center based on width
        y: nodeWithPosition.y - 40, // Center based on height
      };
    }
  });

  return { nodes, edges };
}
