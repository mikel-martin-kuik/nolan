import { useState, useEffect, useCallback } from 'react';
import { Plus, Clock } from 'lucide-react';
import { invoke } from '@/lib/api';
import { useToastStore } from '@/store/toastStore';
import { CRON_PRESETS } from '@/types/scheduler';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScheduleCard } from './ScheduleCard';
import { ScheduleDetailPage } from './ScheduleDetailPage';

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
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleConfig | null>(null);
  const [showNewCard, setShowNewCard] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAgentName, setNewAgentName] = useState('');
  const [newCron, setNewCron] = useState('0 9 * * 1');
  const { success, error } = useToastStore();

  const loadSchedules = useCallback(async () => {
    try {
      const data = await invoke<ScheduleConfig[]>('list_schedules');
      setSchedules(data);
      // Update selected schedule if it exists
      if (selectedSchedule) {
        const updated = data.find(s => s.id === selectedSchedule.id);
        if (updated) setSelectedSchedule(updated);
      }
    } catch (err) {
      error(`Failed to load schedules: ${err}`);
    }
  }, [error, selectedSchedule]);

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

  const handleCreate = async () => {
    if (!newName.trim() || !newAgentName || !newCron) return;
    try {
      await invoke('create_schedule', {
        name: newName.trim(),
        agent_name: newAgentName,
        cron: newCron,
        enabled: true,
        timezone: undefined,
      });
      success('Schedule created');
      setShowNewCard(false);
      setNewName('');
      setNewAgentName('');
      setNewCron('0 9 * * 1');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading schedules...</div>
      </div>
    );
  }

  // Detail page view
  if (selectedSchedule) {
    return (
      <ScheduleDetailPage
        schedule={selectedSchedule}
        onBack={() => setSelectedSchedule(null)}
        onToggle={handleToggle}
      />
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
          onClick={() => setShowNewCard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Schedule
        </button>
      </div>

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

      {/* Schedules Grid */}
      {schedules.length === 0 && !showNewCard ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No schedules yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a schedule to automatically run agents at specific times
          </p>
          <button
            onClick={() => setShowNewCard(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* New schedule card */}
          {showNewCard && (
            <Card className="glass-card transition-all duration-200 rounded-xl">
              <CardHeader className="p-3 pb-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2 py-1 text-sm font-medium bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Schedule name"
                  autoFocus
                />
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                <Select value={newAgentName} onValueChange={setNewAgentName}>
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
                <Select value={newCron} onValueChange={setNewCron}>
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
                    onClick={() => {
                      setShowNewCard(false);
                      setNewName('');
                      setNewAgentName('');
                      setNewCron('0 9 * * 1');
                    }}
                    className="flex-1 px-2 py-1.5 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || !newAgentName || !newCron}
                    className="flex-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing schedules */}
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              agents={agents}
              onUpdate={handleUpdate}
              onDelete={setDeleteScheduleId}
              onToggle={handleToggle}
              onClick={setSelectedSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}
