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

interface WorkflowVisualizerStore {
  // View state
  viewMode: WorkflowViewMode;
  setViewMode: (mode: WorkflowViewMode) => void;

  // Selection state
  selectedPipelineId: string | null;
  setSelectedPipelineId: (id: string | null) => void;
  selectedPhaseId: string | null;
  setSelectedPhaseId: (id: string | null) => void;

  // DAG data
  dagNodes: WorkflowNode[];
  dagEdges: WorkflowEdge[];
  setDagData: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  updateNodeStatus: (nodeId: string, status: PhaseNodeStatus) => void;

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

      selectedPipelineId: null,
      setSelectedPipelineId: (id) => set({ selectedPipelineId: id }),
      selectedPhaseId: null,
      setSelectedPhaseId: (id) => set({ selectedPhaseId: id }),

      dagNodes: [],
      dagEdges: [],
      setDagData: (nodes, edges) => set({ dagNodes: nodes, dagEdges: edges }),
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

      pipelines: [],
      setPipelines: (pipelines) => set({ pipelines }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: 'nolan-workflow-visualizer',
      partialize: (state) => ({ viewMode: state.viewMode }),
    }
  )
);
