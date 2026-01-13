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
  WorkflowNode,
  WorkflowEdge,
  PhaseNodeData,
  SupportAgentData
} from '../types/workflow';
import type { Pipeline } from '../types/generated/cronos/Pipeline';
import dagre from 'dagre';

const POLLING_INTERVAL = 10000; // 10 seconds

export interface UseWorkflowDataResult {
  pipelines: Pipeline[];
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
  const fetchPipelines = useCallback(async (): Promise<Pipeline[]> => {
    try {
      const pipelines = await invoke<Pipeline[]>('list_pipelines', { status: null });
      return pipelines;
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

  // Use pipelines from API directly
  const pipelines = pipelinesFromApi;

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
        // Refresh pipelines when an agent starts (may affect pipeline stage status)
        refetchPipelines();
      } else if (event_type === 'complete') {
        updateNodeStatus(
          agent_name,
          content === 'success' ? 'success' : 'failed'
        );
        // Refresh pipelines when an agent completes
        refetchPipelines();
      }
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [updateNodeStatus, refetchPipelines]);

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
