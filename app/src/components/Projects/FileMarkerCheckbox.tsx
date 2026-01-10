import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileMarkerCheckboxProps {
  projectName: string;
  filePath: string;
  isCompleted: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  disabled?: boolean;
}

export function FileMarkerCheckbox({
  projectName,
  filePath,
  isCompleted,
  completedBy,
  completedAt,
  disabled = false,
}: FileMarkerCheckboxProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  const handleToggle = async () => {
    if (disabled || isUpdating) return;

    setIsUpdating(true);
    try {
      await invoke('update_file_marker', {
        project_name: projectName,
        file_path: filePath,
        completed: !isCompleted,
        agent_name: 'user',
      });
      // Invalidate both projects list and project files
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-files', projectName] });
    } catch (error) {
      console.error('Failed to update file marker:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isUpdating) {
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />;
  }

  return (
    <Checkbox
      checked={isCompleted}
      onCheckedChange={handleToggle}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
      title={
        isCompleted && completedBy
          ? `Completed by ${completedBy} at ${completedAt}`
          : isCompleted
          ? 'Completed'
          : 'Mark as complete'
      }
      className={cn(
        "h-3 w-3 flex-shrink-0",
        isCompleted && "border-green-500 data-[state=checked]:bg-green-500"
      )}
    />
  );
}
