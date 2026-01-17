import React from 'react';
import { cn } from '@/lib/utils';

export interface Tab<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface TabNavigationProps<T extends string = string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Visual variant */
  variant?: 'default' | 'pill';
  /** Additional container class */
  className?: string;
}

export function TabNavigation<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
  className,
}: TabNavigationProps<T>) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 glass-card rounded-lg w-fit overflow-x-auto',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap flex-shrink-0',
            activeTab === tab.id
              ? variant === 'pill'
                ? 'bg-primary text-primary-foreground'
                : 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
