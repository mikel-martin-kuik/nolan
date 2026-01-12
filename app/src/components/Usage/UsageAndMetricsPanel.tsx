import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { DollarSign, Activity } from 'lucide-react';
import { UsagePanel } from './UsagePanel';
import { MetricsPanel } from './MetricsPanel';

type MainTabType = 'usage' | 'metrics';

/**
 * Combined panel for Usage Stats and Execution Metrics.
 * Provides top-level tabs to switch between the existing UsagePanel
 * and the new MetricsPanel for workflow execution tracking.
 */
export const UsageAndMetricsPanel: React.FC = () => {
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('usage');

  const mainTabs: { id: MainTabType; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: 'usage',
      label: 'API Usage',
      icon: <DollarSign className="h-4 w-4" />,
      description: 'Token costs and API usage',
    },
    {
      id: 'metrics',
      label: 'Execution Metrics',
      icon: <Activity className="h-4 w-4" />,
      description: 'Workflow performance and quality',
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 mb-4">
        {mainTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeMainTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
            title={tab.description}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {activeMainTab === 'usage' && <UsagePanel />}
        {activeMainTab === 'metrics' && <MetricsPanel />}
      </div>
    </div>
  );
};

export default UsageAndMetricsPanel;
