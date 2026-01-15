import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@/lib/api';
import type {
  WorkflowViewMode,
  WorkflowNode,
  WorkflowEdge,
  PhaseNodeData,
  PhaseNodeStatus
} from '../types/workflow';
import type { Pipeline } from '../types/generated/scheduler/Pipeline';

interface NodePosition {
  x: number;
  y: number;
}

// Sub-tab for Team Workflow view
export type TeamWorkflowSubTab = 'run' | 'history';

interface WorkflowVisualizerStore {
  // View state
  viewMode: WorkflowViewMode;
  setViewMode: (mode: WorkflowViewMode) => void;

  // Team Workflow sub-tab state
  teamWorkflowSubTab: TeamWorkflowSubTab;
  setTeamWorkflowSubTab: (tab: TeamWorkflowSubTab) => void;

  // Selection state
  selectedPipelineId: string | null;
  setSelectedPipelineId: (id: string | null) => void;
  selectedPhaseId: string | null;
  setSelectedPhaseId: (id: string | null) => void;

  // DAG data
  dagNodes: WorkflowNode[];
  dagEdges: WorkflowEdge[];
  customNodePositions: Record<string, NodePosition>; // User-modified positions
  setDagData: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  updateNodeStatus: (nodeId: string, status: PhaseNodeStatus) => void;
  setNodePosition: (nodeId: string, position: NodePosition) => void;
  resetNodePositions: () => void;

  // Pipeline data - using generated type
  pipelines: Pipeline[];
  setPipelines: (pipelines: Pipeline[]) => void;
  fetchPipelines: () => Promise<void>;

  // Pipeline actions
  skipStage: (runId: string, reason?: string) => Promise<void>;
  abortPipeline: (pipelineId: string, reason?: string) => Promise<void>;
  completePipeline: (pipelineId: string, reason?: string) => Promise<void>;
  retryStage: (runId: string, prompt?: string) => Promise<void>;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useWorkflowVisualizerStore = create<WorkflowVisualizerStore>()(
  persist(
    (set, get) => ({
      viewMode: 'dag',
      setViewMode: (mode) => set({ viewMode: mode }),

      teamWorkflowSubTab: 'run',
      setTeamWorkflowSubTab: (tab) => set({ teamWorkflowSubTab: tab }),

      selectedPipelineId: null,
      setSelectedPipelineId: (id) => set({ selectedPipelineId: id }),
      selectedPhaseId: null,
      setSelectedPhaseId: (id) => set({ selectedPhaseId: id }),

      dagNodes: [],
      dagEdges: [],
      customNodePositions: {},
      setDagData: (nodes, edges) => set((state) => {
        // Merge computed positions with custom positions
        const mergedNodes = nodes.map((node) => {
          const customPos = state.customNodePositions[node.id];
          if (customPos) {
            return { ...node, position: customPos };
          }
          return node;
        });
        return { dagNodes: mergedNodes, dagEdges: edges };
      }),
      updateNodeStatus: (nodeId, status) => set((state) => {
        const updatedNodes = state.dagNodes.map((node) => {
          if (node.id === nodeId) {
            const data = node.data as PhaseNodeData;
            return {
              ...node,
              data: { ...data, status } as PhaseNodeData
            } as WorkflowNode;
          }
          return node;
        });
        return { dagNodes: updatedNodes };
      }),
      setNodePosition: (nodeId, position) => set((state) => ({
        customNodePositions: { ...state.customNodePositions, [nodeId]: position },
        dagNodes: state.dagNodes.map((node) =>
          node.id === nodeId ? { ...node, position } : node
        ),
      })),
      resetNodePositions: () => set({ customNodePositions: {} }),

      pipelines: [],
      setPipelines: (pipelines) => set({ pipelines }),

      fetchPipelines: async () => {
        set({ isLoading: true, error: null });
        try {
          const pipelines = await invoke<Pipeline[]>('list_pipelines');
          set({ pipelines, isLoading: false });

          // Auto-select if only one pipeline and none selected
          const state = get();
          if (pipelines.length === 1 && !state.selectedPipelineId) {
            set({ selectedPipelineId: pipelines[0].id });
          }
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch pipelines',
            isLoading: false
          });
        }
      },

      skipStage: async (runId: string, reason?: string) => {
        try {
          await invoke('skip_pipeline_stage', { run_id: runId, reason: reason || 'Skipped by user' });
          // Refresh pipelines after action
          await get().fetchPipelines();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to skip stage' });
          throw err;
        }
      },

      abortPipeline: async (pipelineId: string, reason?: string) => {
        try {
          await invoke('abort_pipeline', { pipeline_id: pipelineId, reason: reason || 'Aborted by user' });
          // Refresh pipelines after action
          await get().fetchPipelines();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to abort pipeline' });
          throw err;
        }
      },

      completePipeline: async (pipelineId: string, reason?: string) => {
        try {
          await invoke('complete_pipeline', { pipeline_id: pipelineId, reason: reason || 'Manually completed' });
          // Refresh pipelines after action
          await get().fetchPipelines();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to complete pipeline' });
          throw err;
        }
      },

      retryStage: async (runId: string, prompt?: string) => {
        try {
          await invoke('relaunch_scheduled_session', { run_id: runId, follow_up_prompt: prompt || '' });
          // Refresh pipelines after action
          await get().fetchPipelines();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to retry stage' });
          throw err;
        }
      },

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: 'nolan-workflow-visualizer',
      partialize: (state) => ({
        viewMode: state.viewMode,
        teamWorkflowSubTab: state.teamWorkflowSubTab,
        customNodePositions: state.customNodePositions,
      }),
    }
  )
);
