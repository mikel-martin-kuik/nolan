import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { ProjectStatus, PROJECT_STATUS_META, PROJECT_STATUS_OPTIONS } from '@/types/projects';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectStatusDropdownProps {
  projectName: string;
  currentStatus: ProjectStatus;
}

export function ProjectStatusDropdown({ projectName, currentStatus }: ProjectStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  const meta = PROJECT_STATUS_META[currentStatus];

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (newStatus === currentStatus || isUpdating) return;

    setIsUpdating(true);
    try {
      await invoke('update_project_status', {
        project_name: projectName,
        status: newStatus.toUpperCase(),
      });
      // Invalidate projects query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
          "hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring",
          meta.color
        )}
      >
        {isUpdating ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            {meta.label}
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {PROJECT_STATUS_OPTIONS.map((status) => {
          const statusMeta = PROJECT_STATUS_META[status];
          return (
            <DropdownMenuItem
              key={status}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(status);
              }}
              className={cn("flex items-center justify-between cursor-pointer", statusMeta.color)}
            >
              {statusMeta.label}
              {status === currentStatus && <Check className="w-3.5 h-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
