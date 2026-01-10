import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
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

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={disabled || isUpdating}
      title={
        isCompleted && completedBy
          ? `Completed by ${completedBy} at ${completedAt}. Click to unmark.`
          : isCompleted
          ? 'Completed. Click to unmark.'
          : 'Mark as complete'
      }
      className={cn(
        "h-7 w-7",
        isCompleted && "text-green-500 hover:text-green-500"
      )}
    >
      {isUpdating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Check className={cn("w-3.5 h-3.5", isCompleted && "stroke-[3]")} />
      )}
    </Button>
  );
}
