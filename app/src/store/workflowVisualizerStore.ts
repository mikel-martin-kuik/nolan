import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  WorkflowViewMode,
  WorkflowNode,
  WorkflowEdge,
  ImplementationPipeline,
  PhaseNodeData,
  PhaseNodeStatus
} from '../types/workflow';

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

  // Pipeline data
  pipelines: ImplementationPipeline[];
  setPipelines: (pipelines: ImplementationPipeline[]) => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useWorkflowVisualizerStore = create<WorkflowVisualizerStore>()(
  persist(
    (set) => ({
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
