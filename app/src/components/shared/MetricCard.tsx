import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Label text (can be different for mobile vs desktop) */
  label: string;
  /** Short label for mobile (optional) */
  mobileLabel?: string;
  /** The metric value to display */
  value: string | number;
  /** Additional class for value styling */
  valueClassName?: string;
  /** Make card span 2 columns on mobile */
  spanMobile?: boolean;
  /** Additional container class */
  className?: string;
}

export function MetricCard({
  icon,
  label,
  mobileLabel,
  value,
  valueClassName,
  spanMobile = false,
  className,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        'p-3 sm:p-4',
        spanMobile && 'col-span-2 sm:col-span-1',
        className
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}
        {mobileLabel ? (
          <>
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{mobileLabel}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <p className={cn('text-lg sm:text-2xl font-bold', valueClassName)}>
        {value}
      </p>
    </Card>
  );
}
