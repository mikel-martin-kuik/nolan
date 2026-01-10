import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Play, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CronAgentInfo, CronRunStatus } from '@/types';

function getStatusBadgeVariant(status: CronRunStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'success': return 'default';
    case 'failed': return 'destructive';
    case 'running': return 'secondary';
    case 'timeout': return 'destructive';
    case 'cancelled': return 'outline';
    case 'skipped': return 'outline';
    default: return 'outline';
  }
}

interface CronAgentCardProps {
  agent: CronAgentInfo;
  onTrigger: (name: string) => void;
  onDelete: (name: string) => void;
  onClick: (name: string) => void;
  disabled?: boolean;
}

export const CronAgentCard: React.FC<CronAgentCardProps> = ({
  agent,
  onTrigger,
  onDelete,
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

  // Health status icon
  const HealthIcon = () => {
    switch (agent.health.status) {
      case 'healthy': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-3 h-3 text-yellow-500" />;
      case 'critical': return <XCircle className="w-3 h-3 text-red-500" />;
      default: return null;
    }
  };

  return (
    <>
      <Card
        className={`
          glass-card transition-all duration-200 rounded-xl
          ${isClickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] active:translate-y-0' : ''}
          ${disabled ? 'cursor-not-allowed opacity-60' : ''}
          ${agent.enabled ? 'glass-active' : 'opacity-80 hover:opacity-100'}
          ${agent.is_running ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-background' : ''}
        `}
        onClick={isClickable ? handleCardClick : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        onContextMenu={handleContextMenu}
        tabIndex={isClickable ? 0 : undefined}
        role={isClickable ? 'button' : undefined}
        aria-label={`View ${agent.name} details`}
        aria-disabled={disabled}
      >
        <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
          <div className="flex items-center justify-between gap-1">
            <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm">
              {agent.is_running ? (
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              ) : (
                <Clock className="w-3 h-3 text-muted-foreground" />
              )}
              <span className={`truncate ${agent.enabled ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {agent.name.replace(/^cron-/, '')}
              </span>
            </CardTitle>

            <div className="flex items-center gap-1">
              <HealthIcon />
              <Badge
                variant={agent.enabled ? 'default' : 'secondary'}
                className="text-[9px] sm:text-[10px] px-1.5 py-0"
              >
                {agent.enabled ? 'Active' : 'Off'}
              </Badge>
            </div>
          </div>

          <CardDescription className={`text-[10px] sm:text-xs line-clamp-1 ${agent.enabled ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
            {agent.description || 'No description'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono">{agent.schedule}</span>
            {agent.last_run && (
              <Badge variant={getStatusBadgeVariant(agent.last_run.status)} className="text-[9px] px-1.5 py-0">
                {agent.last_run.status}
              </Badge>
            )}
          </div>
          {agent.stats.total_runs > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              {(agent.stats.success_rate * 100).toFixed(0)}% success ({agent.stats.total_runs} runs)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Context menu - portal to body */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {!agent.is_running && (
            <button
              onClick={handleRunNow}
              className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
            >
              <Play className="w-4 h-4" />
              Run Now
            </button>
          )}
          <button
            onClick={handleDeleteAgent}
            disabled={agent.is_running}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
};
