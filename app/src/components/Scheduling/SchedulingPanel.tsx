import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Clock, Play, Pause, Edit2, Trash2, History } from 'lucide-react';
import { invoke } from '@/lib/api';
import { useToastStore } from '@/store/toastStore';
import { ScheduleForm } from './ScheduleForm';
import { CRON_PRESETS } from '@/types/scheduler';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduledRunLog } from '@/types';

export interface ScheduleConfig {
  id: string;
  name: string;
  agent_name: string;
  cron: string;
  enabled: boolean;
  timezone?: string;
  next_run?: string;
}

interface AgentInfo {
  name: string;
  description: string;
}

export function SchedulingPanel() {
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleConfig | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; schedule: ScheduleConfig } | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleConfig | null>(null);
  const [runHistory, setRunHistory] = useState<ScheduledRunLog[]>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { success, error } = useToastStore();

  const loadSchedules = useCallback(async () => {
    try {
      const data = await invoke<ScheduleConfig[]>('list_schedules');
      setSchedules(data);
    } catch (err) {
      error(`Failed to load schedules: ${err}`);
    }
  }, [error]);

  const loadAgents = useCallback(async () => {
    try {
      const data = await invoke<{ name: string; description: string }[]>('list_scheduled_agents');
      setAgents(data.map(a => ({ name: a.name, description: a.description })));
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadSchedules(), loadAgents()]);
      setLoading(false);
    };
    load();
  }, [loadSchedules, loadAgents]);

  const handleCreate = async (data: Omit<ScheduleConfig, 'id' | 'next_run'>) => {
    try {
      await invoke('create_schedule', {
        name: data.name,
        agent_name: data.agent_name,
        cron: data.cron,
        enabled: data.enabled,
        timezone: data.timezone,
      });
      success('Schedule created');
      setShowForm(false);
      loadSchedules();
    } catch (err) {
      error(`Failed to create schedule: ${err}`);
    }
  };

  const handleUpdate = async (data: ScheduleConfig) => {
    try {
      await invoke('update_schedule', {
        id: data.id,
        name: data.name,
        agent_name: data.agent_name,
        cron: data.cron,
        enabled: data.enabled,
        timezone: data.timezone,
      });
      success('Schedule updated');
      setEditingSchedule(null);
      loadSchedules();
    } catch (err) {
      error(`Failed to update schedule: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_schedule', { id });
      success('Schedule deleted');
      setDeleteScheduleId(null);
      loadSchedules();
    } catch (err) {
      error(`Failed to delete schedule: ${err}`);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await invoke('toggle_schedule', { id, enabled });
      loadSchedules();
    } catch (err) {
      error(`Failed to toggle schedule: ${err}`);
    }
  };

  const getCronLabel = (cron: string) => {
    const preset = CRON_PRESETS.find(p => p.cron === cron);
    return preset?.label || cron;
  };

  const loadRunHistory = useCallback(async (agentName: string) => {
    try {
      const history = await invoke<ScheduledRunLog[]>('get_scheduled_run_history', { limit: 100 });
      setRunHistory(history.filter(r => r.agent_name === agentName));
    } catch {
      setRunHistory([]);
    }
  }, []);

  const handleRowClick = (schedule: ScheduleConfig) => {
    setSelectedSchedule(schedule);
    loadRunHistory(schedule.agent_name);
  };

  const handleContextMenu = (e: React.MouseEvent, schedule: ScheduleConfig) => {
    e.preventDefault();
    e.stopPropagation();

    const menuHeight = 140;
    const viewportHeight = window.innerHeight;
    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenu({
      x: e.clientX,
      y: Math.max(8, y),
      schedule,
    });
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenu(null);
    }
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu, handleClickOutside]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading schedules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-muted-foreground">Configure when agents run automatically</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Schedule
        </button>
      </div>

      {/* Form Modal */}
      <Dialog open={showForm || !!editingSchedule} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setEditingSchedule(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
            </DialogTitle>
          </DialogHeader>
          <ScheduleForm
            agents={agents}
            initialData={editingSchedule || undefined}
            onSubmit={(data) => {
              if (editingSchedule) {
                handleUpdate({ ...data, id: editingSchedule.id });
              } else {
                handleCreate(data);
              }
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingSchedule(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteScheduleId} onOpenChange={(open) => !open && setDeleteScheduleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteScheduleId && handleDelete(deleteScheduleId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="bg-card/50 border border-border rounded-xl p-12 text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No schedules yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a schedule to automatically run agents at specific times
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Schedule</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Next Run</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.map((schedule) => (
                <tr
                  key={schedule.id}
                  className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                    selectedSchedule?.id === schedule.id ? 'bg-muted/50' : ''
                  }`}
                  onClick={() => handleRowClick(schedule)}
                  onContextMenu={(e) => handleContextMenu(e, schedule)}
                >
                  <td className="px-4 py-3 font-medium">{schedule.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{schedule.agent_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {getCronLabel(schedule.cron)}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium w-fit ${
                        schedule.enabled
                          ? 'bg-green-500/20 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {schedule.enabled ? (
                        <>
                          <Play className="w-3 h-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3" />
                          Paused
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Run History Panel */}
      {selectedSchedule && (
        <Card className="mt-6">
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" />
              Run History - {selectedSchedule.name}
            </CardTitle>
            <button
              onClick={() => setSelectedSchedule(null)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Close
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-64 px-4 pb-4">
              {runHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <p className="text-sm">No run history yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runHistory.map((run) => {
                    const isFailed = run.status !== 'success' && run.status !== 'running';
                    return (
                      <Card
                        key={run.run_id}
                        className={`p-2 ${isFailed ? 'border-red-500/50' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs">
                              {new Date(run.started_at).toLocaleString()}
                              {run.attempt > 1 && ` (attempt ${run.attempt})`}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                {run.status}
                                {run.trigger !== 'scheduled' && ` · ${run.trigger}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground text-right">
                            {run.duration_secs && (
                              <span>{(run.duration_secs / 60).toFixed(1)}m</span>
                            )}
                            {run.total_cost_usd && (
                              <span className="ml-2">${run.total_cost_usd.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        {run.error && <p className="text-xs text-destructive mt-1 truncate">{run.error}</p>}
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-secondary border border-border rounded-md shadow-lg py-1 min-w-[140px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={() => {
              setEditingSchedule(contextMenu.schedule);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => {
              handleToggle(contextMenu.schedule.id, !contextMenu.schedule.enabled);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-foreground hover:bg-accent transition-colors text-left"
          >
            {contextMenu.schedule.enabled ? (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Enable
              </>
            )}
          </button>
          <button
            onClick={() => {
              setDeleteScheduleId(contextMenu.schedule.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center gap-2 text-red-500 hover:bg-accent transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
