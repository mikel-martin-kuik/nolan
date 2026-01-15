import { useState } from 'react';
import { CRON_PRESETS } from '@/types/scheduler';
import type { ScheduleConfig } from './SchedulingPanel';

interface AgentInfo {
  name: string;
  description: string;
}

interface ScheduleFormProps {
  agents: AgentInfo[];
  initialData?: Partial<ScheduleConfig>;
  onSubmit: (data: Omit<ScheduleConfig, 'id' | 'next_run'>) => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  agent?: string;
  cron?: string;
}

export function ScheduleForm({ agents, initialData, onSubmit, onCancel }: ScheduleFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [agentName, setAgentName] = useState(initialData?.agent_name || '');
  const [cron, setCron] = useState(initialData?.cron || '0 9 * * 1');
  const [customCron, setCustomCron] = useState('');
  const [useCustomCron, setUseCustomCron] = useState(
    initialData?.cron ? !CRON_PRESETS.some(p => p.cron === initialData.cron) : false
  );
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Please enter a schedule name';
    }
    if (!agentName) {
      newErrors.agent = 'Please select an agent';
    }

    const finalCron = useCustomCron ? customCron : cron;
    if (!finalCron.trim()) {
      newErrors.cron = 'Please select or enter a schedule';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onSubmit({
      name: name.trim(),
      agent_name: agentName,
      cron: finalCron,
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1">Schedule Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
          placeholder="e.g., Daily Code Review"
          className={`w-full px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${errors.name ? 'border-destructive' : 'border-border'}`}
        />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>

      {/* Agent */}
      <div>
        <label className="block text-sm font-medium mb-1">Agent</label>
        <select
          value={agentName}
          onChange={(e) => { setAgentName(e.target.value); setErrors(prev => ({ ...prev, agent: undefined })); }}
          className={`w-full px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${errors.agent ? 'border-destructive' : 'border-border'}`}
        >
          <option value="">Select an agent...</option>
          {agents.map((agent) => (
            <option key={agent.name} value={agent.name}>
              {agent.name} - {agent.description}
            </option>
          ))}
        </select>
        {errors.agent && <p className="text-xs text-destructive mt-1">{errors.agent}</p>}
      </div>

      {/* Schedule */}
      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>

        {/* Preset vs Custom toggle */}
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setUseCustomCron(false)}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              !useCustomCron
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Preset
          </button>
          <button
            type="button"
            onClick={() => setUseCustomCron(true)}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              useCustomCron
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Custom
          </button>
        </div>

        {useCustomCron ? (
          <div>
            <input
              type="text"
              value={customCron}
              onChange={(e) => { setCustomCron(e.target.value); setErrors(prev => ({ ...prev, cron: undefined })); }}
              placeholder="e.g., 0 9 * * 1-5 (weekdays at 9am)"
              className={`w-full px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm ${errors.cron ? 'border-destructive' : 'border-border'}`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: minute hour day month weekday
            </p>
            {errors.cron && <p className="text-xs text-destructive mt-1">{errors.cron}</p>}
          </div>
        ) : (
          <select
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CRON_PRESETS.map((preset) => (
              <option key={preset.cron} value={preset.cron}>
                {preset.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 rounded border-border"
        />
        <label htmlFor="enabled" className="text-sm">
          Enable schedule immediately
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {initialData ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
