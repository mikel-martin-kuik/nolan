import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { Terminal, Play, Trash2, MessageSquare, Send, X, FileEdit, Save, Pencil } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { useAgentStore } from '@/store/agentStore';
import { useToastStore } from '@/store/toastStore';
import { useTerminalStore } from '@/store/terminalStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AGENT_DESCRIPTIONS } from '@/types';
import { getAgentDisplayNameForUI, isRalphSession, parseRalphSession } from '@/lib/agentIdentity';
import { useSessionLabelsStore } from '@/store/sessionLabelsStore';
import type { AgentStatus as AgentStatusType } from '@/types';

interface AgentCardProps {
  /** Agent data from store */
  agent: AgentStatusType;

  /** Display variant */
  variant?: 'dashboard' | 'lifecycle' | 'spawned';

  /** Show action buttons */
  showActions?: boolean;

  /** Disabled state */
  disabled?: boolean;

  /** Ralph name from session (e.g., "ziggy" from agent-ralph-ziggy). Team agents don't use this. */
  ralphName?: string;

  /** Hide project label (used when inside TeamCard) */
  hideProject?: boolean;

  /** Show workflow-active highlighting (pulse ring) */
  isWorkflowActive?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  variant = 'lifecycle',
  showActions = true,
  disabled = false,
  ralphName,
  hideProject = false,
  isWorkflowActive = false,
}) => {
  const { spawnAgent, startAgent, killInstance } = useAgentStore();
  const { error: showError, success: showSuccess } = useToastStore();
  const openTerminalModal = useTerminalStore((state) => state.openModal);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showKillDialog, setShowKillDialog] = React.useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showClaudeMdDialog, setShowClaudeMdDialog] = useState(false);
  const [claudeMdContent, setClaudeMdContent] = useState('');
  const [isSavingClaudeMd, setIsSavingClaudeMd] = useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  // Get custom label for this session (only for Ralph)
  const { setLabel, clearLabel, getLabel } = useSessionLabelsStore();
  const customLabel = getLabel(agent.session);

  // Check if this is a free agent (Ralph) vs team agent
  // Ralph sessions: agent-ralph-{name}
  // Team agent sessions: agent-{team}-{name}
  const isRalphAgent = agent.name === 'ralph' || isRalphSession(agent.session);

  // Get visual display name
  // For Ralph: use custom label if set, otherwise use the name from session (e.g., "ziggy" -> "Ziggy")
  // For team agents: capitalize the name (e.g., "ana" -> "Ana")
  const effectiveRalphName = ralphName || (isRalphAgent ? parseRalphSession(agent.session) : undefined);
  const baseDisplayName = getAgentDisplayNameForUI(agent.name, effectiveRalphName);
  const displayName = (isRalphAgent && customLabel) ? customLabel : baseDisplayName;

  // Get agent description from team config (if available)
  const description = AGENT_DESCRIPTIONS[agent.name] || agent.name;

  // Determine primary action based on agent state
  const getPrimaryAction = () => {
    if (!agent.active) {
      return {
        label: isRalphAgent ? `Spawn ${displayName}` : `Start ${displayName}`,
        ariaLabel: isRalphAgent ? `Spawn ${displayName} instance` : `Start ${displayName} agent`,
        icon: Play,
        handler: async () => {
          setIsProcessing(true);
          try {
            // Ralph (free agent) can spawn multiple instances
            // Team agents have exactly one session per team
            if (isRalphAgent) {
              await spawnAgent(agent.team, agent.name);
            } else {
              await startAgent(agent.team, agent.name);
            }
          } catch (error) {
            console.error('Failed to launch agent:', error);
          } finally {
            setIsProcessing(false);
          }
        }
      };
    } else {
      return {
        label: `Send message`,
        ariaLabel: `Send message to ${displayName}`,
        icon: MessageSquare,
        handler: () => {
          setShowMessageDialog(true);
          // Focus the textarea after the dialog opens
          setTimeout(() => messageInputRef.current?.focus(), 100);
        }
      };
    }
  };

  const primaryAction = getPrimaryAction();

  // Handle card click (primary action)
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on a button or inside a button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    if (!disabled && !isProcessing && showActions) {
      primaryAction.handler();
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isProcessing && showActions) {
      e.preventDefault();
      primaryAction.handler();
    }
  };

  // Confirmed kill action
  const handleConfirmKill = async () => {
    setIsProcessing(true);
    try {
      await killInstance(agent.session);
    } catch (error) {
      console.error('Failed to kill agent:', error);
      showError(`Failed to kill agent: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine if card should be clickable
  const isClickable = showActions && !disabled && !isProcessing;

  // Unique identifier for this card's menu
  const menuId = React.useRef(`agent-card-menu-${agent.session}`);

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!showActions) return;

    // Broadcast event to close all other agent card menus
    window.dispatchEvent(new CustomEvent('agent-card-menu-open', { detail: menuId.current }));

    // Estimate menu height (3 items * ~40px each + padding)
    const menuHeight = 140;
    const viewportHeight = window.innerHeight;

    // If menu would overflow bottom, position it above cursor
    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenu({
      x: e.clientX,
      y: Math.max(8, y) // Ensure at least 8px from top
    });
  };

  // Create stable handler callbacks to avoid event listener leaks
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  const handleOtherMenuOpen = useCallback((e: Event) => {
    // Close this menu if another card opened its menu
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  // Close context menu when clicking outside or when another card opens its menu
  React.useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('agent-card-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('agent-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  // Handle context menu option click
  const handleKillFromMenu = () => {
    setContextMenu(null);
    setShowKillDialog(true);
  };

  // Handle edit CLAUDE.md from context menu
  const handleEditClaudeMd = async () => {
    setContextMenu(null);
    try {
      const result = await invoke<string | { content: string }>('read_agent_claude_md', { agent: agent.name });
      const content = typeof result === 'string' ? result : result?.content ?? '';
      setClaudeMdContent(content);
      setShowClaudeMdDialog(true);
    } catch (error) {
      showError(`Failed to load CLAUDE.md: ${error}`);
    }
  };

  // Handle open terminal from context menu
  const handleOpenTerminal = () => {
    setContextMenu(null);
    openTerminalModal(agent.session, agent.name);
  };

  // Handle rename for Ralph sessions
  const handleRenameFromMenu = () => {
    setContextMenu(null);
    setRenameValue(customLabel || '');
    setShowRenameInput(true);
    // Focus the input after render
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameSubmit = async () => {
    const trimmedValue = renameValue.trim();
    if (!trimmedValue) {
      // Clear the label if empty
      try {
        await clearLabel(agent.session);
        showSuccess('Label cleared');
      } catch (error) {
        showError(`Failed to clear label: ${error}`);
      }
    } else {
      try {
        await setLabel(agent.session, trimmedValue);
        showSuccess(`Renamed to "${trimmedValue}"`);
      } catch (error) {
        showError(`Failed to rename: ${error}`);
      }
    }
    setShowRenameInput(false);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setShowRenameInput(false);
      setRenameValue('');
    }
  };

  // Handle save CLAUDE.md
  const handleSaveClaudeMd = async () => {
    setIsSavingClaudeMd(true);
    try {
      await invoke('write_agent_claude_md', { agent: agent.name, content: claudeMdContent });
      showSuccess(`Saved CLAUDE.md for ${displayName}`);
      setShowClaudeMdDialog(false);
    } catch (error) {
      showError(`Failed to save CLAUDE.md: ${error}`);
    } finally {
      setIsSavingClaudeMd(false);
    }
  };

  // Handle keyboard shortcuts in CLAUDE.md dialog
  const handleClaudeMdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveClaudeMd();
    } else if (e.key === 'Escape') {
      setShowClaudeMdDialog(false);
    }
  };

  // Handle sending message to agent
  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    setIsSending(true);
    try {
      // For team agents: use agent name as target (e.g., "carl")
      // For Ralph: use ralph-{instance} format (e.g., "ralph-ziggy")
      const target = isRalphAgent
        ? agent.session.replace('agent-', '')  // ralph-ziggy
        : agent.name;                           // carl
      // Team comes from agent's team field (empty for Ralph)
      const team = agent.team || '';
      await invoke<string>('send_message', { team, target, message: messageText });
      showSuccess(`Message sent to ${displayName}`);
      setMessageText('');
      setShowMessageDialog(false);
    } catch (error) {
      showError(`Failed to send message: ${error}`);
    } finally {
      setIsSending(false);
    }
  };

  // Handle keyboard shortcuts in message dialog
  const handleMessageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Escape') {
      setShowMessageDialog(false);
      setMessageText('');
    }
  };


  return (
    <>
      <Card
        className={`
          glass-card transition-all duration-200 rounded-xl
          ${isClickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:translate-y-0' : ''}
          ${isProcessing ? 'opacity-50' : ''}
          ${disabled ? 'cursor-not-allowed opacity-60' : ''}
          ${agent.active ? 'glass-active' : 'opacity-80 hover:opacity-100'}
          ${isWorkflowActive ? 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background animate-pulse' : ''}
        `}
        onClick={isClickable ? (e) => handleCardClick(e) : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        onContextMenu={handleContextMenu}
        tabIndex={isClickable ? 0 : undefined}
        role={isClickable ? 'button' : undefined}
        aria-label={isClickable ? primaryAction.ariaLabel : undefined}
        aria-disabled={disabled || isProcessing}
      >
      <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <CardTitle className="flex items-center gap-1 text-xs sm:text-sm">
            {/* Agent name - uses visual display name (ralph shows as fun name) */}
            <span className={`truncate ${agent.active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {displayName}
            </span>
          </CardTitle>

          {/* Project bubble - right corner (max 6 chars) - only shown when there's a project */}
          {!hideProject && agent.active && agent.current_project && (() => {
            const projectName = agent.current_project;
            const isShortened = projectName.length > 6;
            const bubble = (
              <span className="inline-flex items-center px-1 py-0 rounded-full text-[9px] sm:text-[10px] font-medium whitespace-nowrap bg-primary/10 text-primary border border-primary/20">
                {projectName.slice(0, 6)}
              </span>
            );
            return isShortened ? (
              <Tooltip content={projectName} side="top">{bubble}</Tooltip>
            ) : bubble;
          })()}
        </div>

        <CardDescription className={`text-[10px] sm:text-xs line-clamp-1 ${agent.active ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          {/* Additional info for lifecycle variant */}
          {variant === 'lifecycle' && agent.active ? (
            <div className="flex items-center gap-1.5 text-[10px]">
              <Terminal className="w-2.5 h-2.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">
                {agent.attached ? 'Attached' : 'Detached'}
              </span>
            </div>
          ) : (
            <div />
          )}
        </div>
      </CardContent>

      {/* Kill confirmation dialog */}
      <ConfirmDialog
        open={showKillDialog}
        onOpenChange={setShowKillDialog}
        title="Kill Agent Session"
        description={`Are you sure you want to kill ${displayName} agent session? This will terminate the agent immediately.`}
        confirmLabel="Kill"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKill}
        variant="destructive"
      />

      </Card>

      {/* Context menu dropdown - rendered via portal to bypass CSS containment issues */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {agent.active && (
            <button
              onClick={handleOpenTerminal}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <Terminal className="w-4 h-4" />
              Open Terminal
            </button>
          )}
          <button
            onClick={handleEditClaudeMd}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <FileEdit className="w-4 h-4" />
            Edit CLAUDE.md
          </button>
          {/* Rename option - only for Ralph agents */}
          {isRalphAgent && (
            <button
              onClick={handleRenameFromMenu}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <Pencil className="w-4 h-4" />
              {customLabel ? 'Rename Instance' : 'Set Custom Name'}
            </button>
          )}
          {agent.active && (
            <button
              onClick={handleKillFromMenu}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
            >
              <Trash2 className="w-4 h-4" />
              Kill Agent
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Message dialog */}
      {showMessageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowMessageDialog(false);
              setMessageText('');
            }}
          />
          <div className="relative bg-background border border-border rounded-xl shadow-lg p-4 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Message {displayName}
              </h3>
              <button
                onClick={() => {
                  setShowMessageDialog(false);
                  setMessageText('');
                }}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              ref={messageInputRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleMessageKeyDown}
              placeholder="Type your message..."
              rows={4}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              disabled={isSending}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Ctrl+Enter to send
              </span>
              <button
                onClick={handleSendMessage}
                disabled={isSending || !messageText.trim()}
                className="px-4 py-2 rounded-lg flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLAUDE.md edit dialog */}
      {showClaudeMdDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowClaudeMdDialog(false)}
          />
          <div className="relative bg-background border border-border rounded-xl shadow-lg p-4 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-primary" />
                Edit CLAUDE.md - {displayName}
              </h3>
              <button
                onClick={() => setShowClaudeMdDialog(false)}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={claudeMdContent}
              onChange={(e) => setClaudeMdContent(e.target.value)}
              onKeyDown={handleClaudeMdKeyDown}
              className="flex-1 min-h-[300px] w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              disabled={isSavingClaudeMd}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Ctrl+S to save
              </span>
              <button
                onClick={handleSaveClaudeMd}
                disabled={isSavingClaudeMd}
                className="px-4 py-2 rounded-lg flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename input overlay */}
      {showRenameInput && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            setShowRenameInput(false);
            setRenameValue('');
          }}
        >
          <div
            className="bg-secondary border border-border rounded-lg p-4 shadow-xl min-w-[300px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium mb-2">Set Custom Name</div>
            <div className="text-xs text-muted-foreground mb-3">
              Give this instance a name for easy identification
            </div>
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              placeholder="e.g., nolan, royme, my-project"
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={30}
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button
                onClick={() => {
                  setShowRenameInput(false);
                  setRenameValue('');
                }}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                {renameValue.trim() ? 'Save' : 'Clear Name'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
