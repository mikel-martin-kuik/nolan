import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  Loader2,
  Lightbulb,
  GitCommit,
  FileText,
  Play,
  User,
  Settings,
} from 'lucide-react';
import type { ScheduledAgentInfo } from '@/types';

interface EventAgentCardProps {
  agent: ScheduledAgentInfo;
}

// Map event types to icons
const eventTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  idea_approved: Lightbulb,
  idea_received: Lightbulb,
  team_workflow_started: Play,
  team_workflow_finished: Play,
  user_logged_in: User,
  git_push: GitCommit,
  file_changed: FileText,
  state_change: Settings,
};

// Human-readable event type names
const eventTypeNames: Record<string, string> = {
  idea_approved: 'Idea Approved',
  idea_received: 'Idea Received',
  team_workflow_started: 'Workflow Started',
  team_workflow_finished: 'Workflow Finished',
  user_logged_in: 'User Logged In',
  git_push: 'Git Push',
  file_changed: 'File Changed',
  state_change: 'State Change',
};

export const EventAgentCard: React.FC<EventAgentCardProps> = ({
  agent,
}) => {
  const isRunning = agent.is_running;
  const trigger = agent.event_trigger;

  // Get icon for event type
  const eventType = trigger?.event_type || 'state_change';
  const IconComponent = eventTypeIcons[eventType] || Zap;
  const eventTypeName = eventTypeNames[eventType] || eventType;

  return (
    <Card className={`transition-all ${isRunning ? 'border-primary' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted">
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">
                {agent.name.replace('event-', '')}
              </CardTitle>
              <Badge variant="outline" className="text-xs mt-1">
                {eventTypeName}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isRunning && (
              <Badge variant="default">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Running
              </Badge>
            )}
            {!agent.enabled && (
              <Badge variant="secondary">Disabled</Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-xs mt-2">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Trigger Configuration */}
        {trigger && (
          <div className="space-y-2 text-xs">
            {trigger.pattern && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Pattern:</span>
                <code className="bg-muted px-1 rounded">{trigger.pattern}</code>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Debounce:</span>
              <span>{trigger.debounce_ms}ms</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between mt-3">
          <Badge variant="outline" className="text-xs">
            {agent.model}
          </Badge>
          {agent.stats.total_runs > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{agent.stats.total_runs} runs</span>
              <span>|</span>
              <span>{Math.round(agent.stats.success_rate * 100)}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
