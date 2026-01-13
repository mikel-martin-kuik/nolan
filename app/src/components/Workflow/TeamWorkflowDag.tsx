import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PhaseNode } from './nodes/PhaseNode';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PhaseNodeData } from '../../types/workflow';

const nodeTypes: NodeTypes = {
  phaseNode: PhaseNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
};

interface TeamWorkflowDagProps {
  onPhaseClick?: (phaseId: string) => void;
}

export function TeamWorkflowDag({ onPhaseClick }: TeamWorkflowDagProps) {
  const dagNodes = useWorkflowVisualizerStore((state) => state.dagNodes);
  const dagEdges = useWorkflowVisualizerStore((state) => state.dagEdges);
  const isLoading = useWorkflowVisualizerStore((state) => state.isLoading);
  const setSelectedPhaseId = useWorkflowVisualizerStore((state) => state.setSelectedPhaseId);

  // Cast to any[] to satisfy React Flow's internal typing while preserving our data
  const initialNodes = useMemo(() => dagNodes as Node[], [dagNodes]);
  const initialEdges = useMemo(() => dagEdges as Edge[], [dagEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync with store updates
  useEffect(() => {
    setNodes(dagNodes as Node[]);
    setEdges(dagEdges as Edge[]);
  }, [dagNodes, dagEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedPhaseId(node.id);
      onPhaseClick?.(node.id);
    },
    [setSelectedPhaseId, onPhaseClick]
  );

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Team Workflow</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-60px)]">
          <div className="w-full h-full bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (nodes.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>No workflow phases configured</p>
          <p className="text-sm">Configure team workflow in Team settings</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as PhaseNodeData | undefined;
            const status = data?.status;
            switch (status) {
              case 'running': return '#3b82f6';
              case 'success': return '#22c55e';
              case 'failed': return '#ef4444';
              default: return '#9ca3af';
            }
          }}
          position="top-right"
        />
      </ReactFlow>
    </div>
  );
}
