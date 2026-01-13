import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbNavProps {
  breadcrumbs: { name: string; path: string }[];
  onNavigate: (path: string) => void;
}

export function BreadcrumbNav({ breadcrumbs, onNavigate }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-1 mb-3 text-sm overflow-x-auto">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <div key={crumb.path} className="flex items-center gap-1 flex-shrink-0">
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
            <button
              onClick={() => onNavigate(crumb.path)}
              className={cn(
                'hover:text-foreground transition-colors px-1 py-0.5 rounded',
                isLast
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-foreground/5'
              )}
              disabled={isLast}
            >
              {crumb.name}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
