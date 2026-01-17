import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Play, Pause, Edit2, Trash2, Check, X } from 'lucide-react';
import { CRON_PRESETS } from '@/types/scheduler';
import type { ScheduleConfig } from './SchedulingPanel';

interface AgentInfo {
  name: string;
  description: string;
}

interface ScheduleCardProps {
  schedule: ScheduleConfig;
  agents: AgentInfo[];
  onUpdate: (data: ScheduleConfig) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onClick: (schedule: ScheduleConfig) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  schedule,
  agents,
  onUpdate,
  onDelete,
  onToggle,
  onClick,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(schedule.name);
  const [editAgentName, setEditAgentName] = useState(schedule.agent_name);
  const [editCron, setEditCron] = useState(schedule.cron);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuId = useRef(`schedule-card-menu-${schedule.id}`);

  const getCronLabel = (cron: string) => {
    const preset = CRON_PRESETS.find(p => p.cron === cron);
    return preset?.label || cron;
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('[role="combobox"]') || isEditing) return;
    onClick(schedule);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    window.dispatchEvent(new CustomEvent('schedule-card-menu-open', { detail: menuId.current }));

    const menuHeight = 140;
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

  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('schedule-card-menu-open', handleOtherMenuOpen);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('schedule-card-menu-open', handleOtherMenuOpen);
    };
  }, [contextMenu, handleClickOutside, handleOtherMenuOpen]);

  const startEditing = () => {
    setEditName(schedule.name);
    setEditAgentName(schedule.agent_name);
    setEditCron(schedule.cron);
    setIsEditing(true);
    setContextMenu(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditName(schedule.name);
    setEditAgentName(schedule.agent_name);
    setEditCron(schedule.cron);
  };

  const saveEditing = () => {
    if (!editName.trim() || !editAgentName || !editCron) return;
    onUpdate({
      ...schedule,
      name: editName.trim(),
      agent_name: editAgentName,
      cron: editCron,
    });
    setIsEditing(false);
  };

  const handleToggle = () => {
    setContextMenu(null);
    onToggle(schedule.id, !schedule.enabled);
  };

  const handleDelete = () => {
    setContextMenu(null);
    onDelete(schedule.id);
  };

  if (isEditing) {
    return (
      <Card className="glass-card transition-all duration-200 rounded-xl">
        <CardHeader className="p-3 pb-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-2 py-1 text-sm font-medium bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Schedule name"
            autoFocus
          />
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <Select value={editAgentName} onValueChange={setEditAgentName}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.name} value={agent.name} className="text-xs">
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={editCron} onValueChange={setEditCron}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select schedule" />
            </SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.map((preset) => (
                <SelectItem key={preset.cron} value={preset.cron} className="text-xs">
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 pt-1">
            <button
              onClick={cancelEditing}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              onClick={saveEditing}
              disabled={!editName.trim() || !editAgentName || !editCron}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              Save
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card
        className={cn(
          'glass-card transition-all duration-200 rounded-xl h-full',
          'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
          schedule.enabled ? 'glass-active' : 'opacity-80 hover:opacity-100'
        )}
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        role="button"
        aria-label={`View ${schedule.name} run history`}
      >
        <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={cn(
              'truncate',
              schedule.enabled ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {schedule.name}
            </span>
            <span className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0',
              schedule.enabled
                ? 'bg-green-500/20 text-green-500'
                : 'bg-muted text-muted-foreground'
            )}>
              {schedule.enabled ? (
                <><Play className="w-2.5 h-2.5" />Active</>
              ) : (
                <><Pause className="w-2.5 h-2.5" />Paused</>
              )}
            </span>
          </CardTitle>
          <CardDescription className={cn(
            'text-[10px] sm:text-xs line-clamp-1',
            schedule.enabled ? 'text-muted-foreground' : 'text-muted-foreground/60'
          )}>
            {schedule.agent_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-mono text-[9px]">{getCronLabel(schedule.cron)}</span>
            {schedule.next_run && (
              <span className="text-[9px] text-muted-foreground/70">
                Next: {new Date(schedule.next_run).toLocaleDateString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[120px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={startEditing}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={handleToggle}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            {schedule.enabled ? (
              <><Pause className="w-4 h-4" />Pause</>
            ) : (
              <><Play className="w-4 h-4" />Enable</>
            )}
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
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
