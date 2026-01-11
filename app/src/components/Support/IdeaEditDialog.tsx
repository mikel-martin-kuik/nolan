import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { invoke } from '@/lib/api';
import { Idea } from '@/types';
import { Loader2 } from 'lucide-react';

interface IdeaEditDialogProps {
  idea: Idea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeaEditDialog({ idea, open, onOpenChange }: IdeaEditDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [description, setDescription] = useState(idea?.description ?? '');

  // Reset form when idea changes
  useEffect(() => {
    setTitle(idea?.title ?? '');
    setDescription(idea?.description ?? '');
  }, [idea]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!idea) throw new Error('No idea to update');
      return invoke<Idea>('update_idea', {
        id: idea.id,
        title: title.trim(),
        description: description.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea && title.trim() && description.trim()) {
      updateMutation.mutate();
    }
  };

  const isValid = title.trim().length > 0 && description.trim().length > 0;
  const hasChanges = idea ? (title !== idea.title || description !== idea.description) : false;

  if (!idea) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Idea</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="edit-idea-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="edit-idea-title"
              placeholder="Quick summary of your idea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="edit-idea-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="edit-idea-description"
              placeholder="Describe your idea..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={2000}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || !hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
