import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Loader2,
  Shield,
  Hammer,
  Search,
  Rocket,
  GitCommit,
  Sparkles,
} from 'lucide-react';
import type { CronAgentInfo } from '@/types';

interface PredefinedAgentCardProps {
  agent: CronAgentInfo;
  onTrigger: (name: string) => void;
}

// Map icon names to Lucide icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Hammer,
  Search,
  Rocket,
  GitCommit,
  Sparkles,
};

export const PredefinedAgentCard: React.FC<PredefinedAgentCardProps> = ({
  agent,
  onTrigger,
}) => {
  const isRunning = agent.is_running;

  // Get icon component from invocation config
  const IconComponent = agent.invocation?.icon
    ? iconMap[agent.invocation.icon] || Play
    : Play;

  // Get button label from invocation config
  const buttonLabel = agent.invocation?.button_label || 'Run';

  // Get slash command if available
  const slashCommand = agent.invocation?.command;

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
                {agent.name.replace('pred-', '')}
              </CardTitle>
              {slashCommand && (
                <code className="text-xs text-muted-foreground">
                  {slashCommand}
                </code>
              )}
            </div>
          </div>
          {!agent.enabled && (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </div>
        <CardDescription className="text-xs mt-2">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            {agent.model}
          </Badge>
          <Button
            size="sm"
            onClick={() => onTrigger(agent.name)}
            disabled={isRunning || !agent.enabled}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {buttonLabel}
              </>
            )}
          </Button>
        </div>

        {/* Show stats if available */}
        {agent.stats.total_runs > 0 && (
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <span>{agent.stats.total_runs} runs</span>
            <span>|</span>
            <span>{Math.round(agent.stats.success_rate * 100)}% success</span>
            {agent.stats.avg_cost_usd && (
              <>
                <span>|</span>
                <span>${agent.stats.avg_cost_usd.toFixed(2)} avg</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
