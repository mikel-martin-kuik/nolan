import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Trash2, CheckCircle2, XCircle } from 'lucide-react';
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
    <div
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative rounded-xl border border-border bg-card p-4 transition-all',
        has_claude_md && 'cursor-pointer hover:border-primary/50',
        isComplete && 'shadow-sm shadow-green-500/20 hover:shadow-md hover:shadow-green-500/30',
        needsAttention && 'shadow-sm shadow-orange-500/30 hover:shadow-md hover:shadow-orange-500/40',
        isMissingDir && 'shadow-sm shadow-red-500/30 hover:shadow-md hover:shadow-red-500/40'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-foreground">
              {name}
            </h3>
            {/* Status indicator */}
            {isComplete && (
              <span title="Complete">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </span>
            )}
            {needsAttention && (
              <span title="Missing files">
                <XCircle className="w-4 h-4 text-orange-500" />
              </span>
            )}
            {isMissingDir && (
              <span title="Directory not found">
                <XCircle className="w-4 h-4 text-destructive" />
              </span>
            )}
          </div>

          {/* Role from agent.json */}
          {agentInfo.role ? (
            <p className="text-sm text-muted-foreground">
              {agentInfo.role}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No role defined</p>
          )}
        </div>

      </div>

      {/* Details */}
      <div className="space-y-2 text-xs">
        {/* Actions for missing files */}
        {needsAttention && (
          <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2">
            {!has_claude_md && (
              <button
                onClick={handleCreateClaudeMd}
                disabled={isCreatingClaudeMd}
                className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingClaudeMd ? 'Creating...' : 'Create CLAUDE.md'}
              </button>
            )}
            {!has_agent_json && (
              <button
                onClick={handleCreateAgentJson}
                disabled={isCreatingAgentJson}
                className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingAgentJson ? 'Creating...' : 'Create agent.json'}
              </button>
            )}
          </div>
        )}

        {/* Error for missing directory */}
        {isMissingDir && (
          <div className="pt-2 border-t border-border/50">
            <span className="text-xs text-destructive">Directory not found</span>
          </div>
        )}
      </div>

      {/* Model bubble - bottom right */}
      {has_agent_json && agentInfo.model && (
        <div className="absolute bottom-3 right-3">
          <span className="px-2 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground">
            {agentInfo.model}
          </span>
        </div>
      )}
    </div>

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
