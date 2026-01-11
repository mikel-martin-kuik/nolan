import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Trash2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { AgentDirectoryInfo } from '@/types';
import { cn } from '../../lib/utils';

interface AgentCardProps {
  agentInfo: AgentDirectoryInfo;
  onEdit: (agentName: string) => void;
  onDelete: (agentName: string) => void;
  onCreateClaudeMd: (agentName: string) => Promise<void>;
  onCreateAgentJson: (agentName: string) => Promise<void>;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agentInfo,
  onEdit,
  onDelete,
  onCreateClaudeMd,
  onCreateAgentJson,
}) => {
  const { name, exists, has_claude_md, has_agent_json } = agentInfo;
  const [isCreatingClaudeMd, setIsCreatingClaudeMd] = useState(false);
  const [isCreatingAgentJson, setIsCreatingAgentJson] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`agent-manager-card-menu-${name}`);

  // Determine status
  const isComplete = exists && has_claude_md && has_agent_json;
  const needsAttention = exists && (!has_claude_md || !has_agent_json);
  const isMissingDir = !exists;

  // Handle create CLAUDE.md
  const handleCreateClaudeMd = async () => {
    setIsCreatingClaudeMd(true);
    try {
      await onCreateClaudeMd(name);
    } finally {
      setIsCreatingClaudeMd(false);
    }
  };

  // Handle create agent.json
  const handleCreateAgentJson = async () => {
    setIsCreatingAgentJson(true);
    try {
      await onCreateAgentJson(name);
    } finally {
      setIsCreatingAgentJson(false);
    }
  };

  // Handle card click - open editor if CLAUDE.md exists
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    if (has_claude_md) {
      onEdit(name);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Broadcast event to close all other agent card menus
    window.dispatchEvent(new CustomEvent('agent-manager-card-menu-open', { detail: menuId.current }));

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Handle click outside to close context menu
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  // Handle other menu opening (close this one)
  const handleOtherMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  // Close context menu when clicking outside or when another card opens its menu
  useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('agent-manager-card-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('agent-manager-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  // Handle delete from context menu
  const handleDeleteFromMenu = () => {
    setContextMenu(null);
    onDelete(name);
  };

  return (
    <>
    <Card
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'glass-card transition-all duration-200 rounded-xl h-full',
        has_claude_md && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:translate-y-0',
        needsAttention && 'border-orange-500/50',
        isMissingDir && 'border-red-500/50 opacity-60'
      )}
    >
      <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
          <span className={cn(
            'truncate',
            isComplete ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </span>
          {/* Status indicator - only show for issues */}
          {needsAttention && (
            <XCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
          )}
          {isMissingDir && (
            <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
          )}
        </CardTitle>

        <CardDescription className="text-[10px] sm:text-xs line-clamp-1 text-muted-foreground">
          {agentInfo.role || 'No role defined'}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
        {/* Actions for missing files */}
        {needsAttention && (
          <div className="flex flex-wrap gap-1.5">
            {!has_claude_md && (
              <button
                onClick={handleCreateClaudeMd}
                disabled={isCreatingClaudeMd}
                className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingClaudeMd ? '...' : '+ CLAUDE.md'}
              </button>
            )}
            {!has_agent_json && (
              <button
                onClick={handleCreateAgentJson}
                disabled={isCreatingAgentJson}
                className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingAgentJson ? '...' : '+ agent.json'}
              </button>
            )}
          </div>
        )}

        {/* Error for missing directory */}
        {isMissingDir && (
          <span className="text-[10px] text-destructive">Directory not found</span>
        )}

        {/* Model display for complete agents */}
        {isComplete && agentInfo.model && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[9px] text-muted-foreground/70">{agentInfo.model}</span>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Context menu dropdown */}
    {contextMenu && (
      <div
        ref={contextMenuRef}
        className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[140px]"
        style={{
          left: `${contextMenu.x}px`,
          top: `${contextMenu.y}px`,
        }}
      >
        <button
          onClick={handleDeleteFromMenu}
          className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
        >
          <Trash2 className="w-4 h-4" />
          Delete Agent
        </button>
      </div>
    )}
    </>
  );
};
