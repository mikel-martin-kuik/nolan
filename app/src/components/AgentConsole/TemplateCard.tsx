import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Download, Loader2 } from 'lucide-react';
import type { TemplateInfo } from '@/types';

interface TemplateCardProps {
  template: TemplateInfo;
  onInstall: (name: string) => void;
  isInstalling?: boolean;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onInstall,
  isInstalling,
}) => {
  const displayName = template.name.replace('pred-', '');

  const handleClick = () => {
    if (!isInstalling) {
      onInstall(template.name);
    }
  };

  return (
    <Card
      className={cn(
        'glass-card transition-all duration-200 rounded-xl h-full',
        'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
        'border-dashed opacity-70 hover:opacity-100',
        isInstalling && 'cursor-wait'
      )}
      onClick={handleClick}
      role="button"
      aria-label={`Install ${displayName}`}
    >
      <CardHeader className="p-2 sm:p-3 pb-1 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="truncate text-muted-foreground">
            {displayName}
          </span>
          {isInstalling ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : (
            <Download className="w-3 h-3 text-muted-foreground" />
          )}
        </CardTitle>

        <CardDescription className="text-[10px] sm:text-xs line-clamp-1 text-muted-foreground/60">
          {template.description || 'No description'}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-2 sm:p-3 pt-0 text-[10px] sm:text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="font-mono text-[9px]">{template.model}</span>
          <span className="text-[9px] text-muted-foreground/70">
            {isInstalling ? 'Installing...' : 'Click to install'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
