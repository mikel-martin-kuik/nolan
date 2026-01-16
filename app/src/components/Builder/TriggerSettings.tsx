import React, { useEffect, useState } from 'react';
import { invoke } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Loader2, Save, RefreshCw } from 'lucide-react';
import type { ScheduledAgentInfo } from '@/types/scheduler';

interface TriggerConfig {
  idea_processor: string | null;
  // Note: idea_implementer, implementer_analyzer, idea_merger are now configured
  // per-pipeline in Builder > Pipelines tab
}

const TRIGGER_LABELS: Record<keyof TriggerConfig, { label: string; description: string }> = {
  idea_processor: {
    label: 'Idea Processor',
    description: 'Agent that processes raw ideas into structured proposals (Layer 1 entry point)',
  },
};

const DEFAULT_VALUES: Record<keyof TriggerConfig, string> = {
  idea_processor: 'idea-processor',
};

export const TriggerSettings: React.FC = () => {
  const [config, setConfig] = useState<TriggerConfig>({
    idea_processor: null,
  });
  const [agents, setAgents] = useState<ScheduledAgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [triggerConfig, agentList] = await Promise.all([
        invoke<TriggerConfig>('get_trigger_config'),
        invoke<ScheduledAgentInfo[]>('list_scheduled_agents'),
      ]);
      setConfig(triggerConfig);
      setAgents(agentList);
      setHasChanges(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleChange = (key: keyof TriggerConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value || null }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await invoke('set_trigger_config', { config });
      setHasChanges(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const getValue = (key: keyof TriggerConfig): string => {
    return config[key] ?? DEFAULT_VALUES[key];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Settings2 className="h-5 w-5" />
          Trigger Configuration
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Configure which agents handle idea processing triggers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status header with refresh button */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {agents.length} agents available
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              title="Refresh agents"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              title="Save changes"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="ml-2">Save</span>
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && agents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading configuration...
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.keys(TRIGGER_LABELS) as Array<keyof TriggerConfig>).map((key) => (
              <div key={key} className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium">
                      {TRIGGER_LABELS[key].label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {TRIGGER_LABELS[key].description}
                    </p>
                  </div>
                  <Select
                    value={getValue(key)}
                    onValueChange={(value) => handleChange(key, value)}
                  >
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents
                        .filter((agent) => agent.enabled)
                        .map((agent) => (
                          <SelectItem key={agent.name} value={agent.name}>
                            {agent.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-3">
            Error: {error}
          </div>
        )}

      </CardContent>
    </Card>
  );
};
