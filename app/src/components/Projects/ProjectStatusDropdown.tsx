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
import { Check, Loader2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectStatusDropdownProps {
  projectName: string;
  currentStatus: ProjectStatus;
}

export function ProjectStatusDropdown({ projectName, currentStatus }: ProjectStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (newStatus === currentStatus || isUpdating) return;

    setIsUpdating(true);
    try {
      await invoke('update_project_status', {
        projectName: projectName,
        status: newStatus.toUpperCase(),
      });
      // Invalidate projects query to refresh UI
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
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
          "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-accent/50 focus:opacity-100 focus:outline-none",
          "text-muted-foreground hover:text-foreground"
        )}
        title="Change status"
      >
        {isUpdating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MoreHorizontal className="w-3.5 h-3.5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
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
