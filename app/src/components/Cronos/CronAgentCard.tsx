import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CronAgentInfo } from '@/types';

interface CronAgentCardProps {
  agent: CronAgentInfo;
  onTrigger: (name: string) => void;
  onDelete: (name: string) => void;
  onToggleEnabled: (name: string, enabled: boolean) => void;
  onClick: (name: string) => void;
  disabled?: boolean;
}

export const CronAgentCard: React.FC<CronAgentCardProps> = ({
  agent,
  onTrigger,
  onDelete,
  onToggleEnabled,
  onClick,
  disabled = false,
}) => {
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useRef(`cron-card-menu-${agent.name}`);

  const isClickable = !disabled;

  // Handle left click - navigate to detail view or show live output
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (!isClickable) return;
    onClick(agent.name);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
      e.preventDefault();
      onClick(agent.name);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Broadcast event to close all other menus
    window.dispatchEvent(new CustomEvent('cron-card-menu-open', { detail: menuId.current }));

    // Estimate menu height (2 items * ~40px each + padding)
    const menuHeight = 100;
    const viewportHeight = window.innerHeight;

    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenu({
      x: e.clientX,
      y: Math.max(8, y)
    });
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  const handleOtherMenuOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    if (customEvent.detail !== menuId.current) {
      setContextMenu(null);
    }
  }, []);

  React.useEffect(() => {
    if (!contextMenu) return;

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('cron-card-menu-open', handleOtherMenuOpen);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('cron-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  const handleRunNow = () => {
    setContextMenu(null);
    onTrigger(agent.name);
  };

  const handleDeleteAgent = () => {
    setContextMenu(null);
    onDelete(agent.name);
  };

  const handleToggleEnabled = () => {
    setContextMenu(null);
    onToggleEnabled(agent.name, !agent.enabled);
  };

  // Check if last run failed (not success)
  const hasFailed = agent.last_run && agent.last_run.status !== 'success' && agent.last_run.status !== 'running';

  return (
    <>
      <Card
        className={cn(
          'glass-card transition-all duration-200 rounded-xl h-full',
          'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
          agent.enabled ? 'glass-active' : 'opacity-80 hover:opacity-100',
          disabled && 'cursor-not-allowed opacity-60',
          hasFailed && 'border-red-500/50'
        )}
        onClick={isClickable ? handleCardClick : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        onContextMenu={handleContextMenu}
        tabIndex={isClickable ? 0 : undefined}
        role={isClickable ? 'button' : undefined}
        aria-label={`View ${agent.name} details`}
        aria-disabled={disabled}
      >
        <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={cn(
              'truncate',
              agent.enabled ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {agent.name.replace(/^cron-/, '')}
            </span>
            {agent.is_running && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </CardTitle>

          <CardDescription className={cn(
            'text-[10px] sm:text-xs line-clamp-1',
            agent.enabled ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}>
            {agent.description || 'No description'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[9px]">{agent.schedule}</span>
            {agent.stats.total_runs > 0 && (
              <span className="text-[9px] text-muted-foreground/70">
                {(agent.stats.success_rate * 100).toFixed(0)}% ({agent.stats.total_runs})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Context menu - portal to body */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[120px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {!agent.is_running && (
            <button
              onClick={handleRunNow}
              className="w-full px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
            >
              Run Now
            </button>
          )}
          <button
            onClick={handleToggleEnabled}
            disabled={agent.is_running}
            className="w-full px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {agent.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={handleDeleteAgent}
            disabled={agent.is_running}
            className="w-full px-3 py-2 text-sm text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
};
