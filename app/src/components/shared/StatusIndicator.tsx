import React from 'react';

interface StatusIndicatorProps {
  active: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  active,
  size = 'md',
  showLabel = false,
}) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colorClass = active ? 'bg-green-500' : 'bg-red-500';
  const label = active ? 'Active' : 'Inactive';

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} ${colorClass} rounded-full animate-pulse`}
        title={label}
      />
      {showLabel && (
        <span className={`text-sm ${active ? 'text-green-400' : 'text-red-400'}`}>
          {label}
        </span>
      )}
    </div>
  );
};
