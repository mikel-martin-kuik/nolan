import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PhaseNode } from './nodes/PhaseNode';
import { SupportAgentNode } from './nodes/SupportAgentNode';
import { useWorkflowVisualizerStore } from '../../store/workflowVisualizerStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { PhaseNodeData, SupportAgentData } from '../../types/workflow';

const nodeTypes: NodeTypes = {
  phaseNode: PhaseNode,
  supportAgent: SupportAgentNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
};

interface ContextMenuState {
  x: number;
  y: number;
  type: 'node' | 'pane';
  phaseId?: string;
}

interface TeamWorkflowDagProps {
  onPhaseClick?: (phaseId: string) => void;
  onEditPhase?: (phaseId: string) => void;
  onDeletePhase?: (phaseId: string) => void;
  onAddPhase?: () => void;
}

export function TeamWorkflowDag({ onPhaseClick, onEditPhase, onDeletePhase, onAddPhase }: TeamWorkflowDagProps) {
  const dagNodes = useWorkflowVisualizerStore((state) => state.dagNodes);
  const dagEdges = useWorkflowVisualizerStore((state) => state.dagEdges);
  const isLoading = useWorkflowVisualizerStore((state) => state.isLoading);
  const setSelectedPhaseId = useWorkflowVisualizerStore((state) => state.setSelectedPhaseId);
  const setNodePosition = useWorkflowVisualizerStore((state) => state.setNodePosition);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Cast to any[] to satisfy React Flow's internal typing while preserving our data
  const initialNodes = useMemo(() => dagNodes as Node[], [dagNodes]);
  const initialEdges = useMemo(() => dagEdges as Edge[], [dagEdges]);

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Wrap onNodesChange to persist position changes to the store
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeInternal(changes);
      // Persist position changes when drag ends
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false && change.position) {
          setNodePosition(change.id, change.position);
        }
      }
    },
    [onNodesChangeInternal, setNodePosition]
  );

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

  // Context menu handlers
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();

      const menuHeight = 100;
      const viewportHeight = window.innerHeight;
      const y = event.clientY + menuHeight > viewportHeight
        ? event.clientY - menuHeight
        : event.clientY;

      setContextMenu({
        x: event.clientX,
        y: Math.max(8, y),
        type: 'node',
        phaseId: node.id,
      });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        type: 'pane',
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleEditPhase = useCallback(() => {
    if (contextMenu?.phaseId && onEditPhase) {
      onEditPhase(contextMenu.phaseId);
    }
    closeContextMenu();
  }, [contextMenu, onEditPhase, closeContextMenu]);

  const handleDeletePhase = useCallback(() => {
    if (contextMenu?.phaseId && onDeletePhase) {
      onDeletePhase(contextMenu.phaseId);
    }
    closeContextMenu();
  }, [contextMenu, onDeletePhase, closeContextMenu]);

  const handleAddPhase = useCallback(() => {
    onAddPhase?.();
    closeContextMenu();
  }, [onAddPhase, closeContextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as globalThis.Node)) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu, closeContextMenu]);

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
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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
            // Support agent nodes have different base colors
            if (node.type === 'supportAgent') {
              const data = node.data as SupportAgentData | undefined;
              if (data?.role === 'note_taker') return '#a855f7'; // purple
              if (data?.role === 'guardian') return '#f59e0b'; // amber
              return '#9ca3af';
            }
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

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          {contextMenu.type === 'node' ? (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start rounded-none"
                onClick={handleEditPhase}
                disabled={!onEditPhase}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Phase
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start rounded-none text-destructive hover:text-destructive"
                onClick={handleDeletePhase}
                disabled={!onDeletePhase}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Phase
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start rounded-none"
              onClick={handleAddPhase}
              disabled={!onAddPhase}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Phase
            </Button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
