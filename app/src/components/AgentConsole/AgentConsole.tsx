import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentsPanel } from '../ScheduledAgents/AgentsPanel';
import { PredefinedAgentsPanel } from './PredefinedAgentsPanel';
import { EventAgentsPanel } from './EventAgentsPanel';
import { Clock, Play, Zap } from 'lucide-react';

type AgentTab = 'cron' | 'predefined' | 'event';

export const AgentConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AgentTab>('cron');

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as AgentTab)}
        className="h-full flex flex-col"
      >
        <div className="flex-shrink-0 px-2 sm:px-4 pt-2 sm:pt-3 border-b border-border">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="cron" className="flex items-center gap-1 sm:gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Scheduled</span>
              <span className="sm:hidden text-xs">Sched</span>
            </TabsTrigger>
            <TabsTrigger value="predefined" className="flex items-center gap-1 sm:gap-2">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">On-Demand</span>
              <span className="sm:hidden text-xs">Demand</span>
            </TabsTrigger>
            <TabsTrigger value="event" className="flex items-center gap-1 sm:gap-2">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Event-Driven</span>
              <span className="sm:hidden text-xs">Event</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cron" className="flex-1 mt-0 p-0">
          <AgentsPanel />
        </TabsContent>

        <TabsContent value="predefined" className="flex-1 mt-0">
          <PredefinedAgentsPanel />
        </TabsContent>

        <TabsContent value="event" className="flex-1 mt-0">
          <EventAgentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
