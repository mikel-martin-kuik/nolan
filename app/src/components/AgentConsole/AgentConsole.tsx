import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CronosPanel } from '../Cronos/CronosPanel';
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
        <div className="flex-shrink-0 px-4 pt-3 border-b border-border">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="cron" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Scheduled</span>
            </TabsTrigger>
            <TabsTrigger value="predefined" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              <span>On-Demand</span>
            </TabsTrigger>
            <TabsTrigger value="event" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>Event-Driven</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cron" className="flex-1 mt-0 p-0">
          <CronosPanel />
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
