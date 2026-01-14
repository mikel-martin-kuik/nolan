import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Idea, TAG_COLORS, DEFAULT_TAG_COLOR } from '@/types';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
}

interface IdeaEditDialogProps {
  idea: Idea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IdeaEditDialog({ idea, open, onOpenChange }: IdeaEditDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [description, setDescription] = useState(idea?.description ?? '');
  const [tags, setTags] = useState<string[]>(idea?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Fetch all existing tags for autocomplete
  const { data: allTags = [] } = useQuery({
    queryKey: ['idea-tags'],
    queryFn: () => invoke<string[]>('list_all_idea_tags'),
    enabled: open,
  });

  // Reset form when idea changes
  useEffect(() => {
    setTitle(idea?.title ?? '');
    setDescription(idea?.description ?? '');
    setTags(idea?.tags ?? []);
    setTagInput('');
    setShowSuggestions(false);
  }, [idea]);

  // Filter suggestions based on input
  const suggestions = tagInput.trim()
    ? allTags.filter(
        (tag) =>
          tag.toLowerCase().includes(tagInput.toLowerCase()) &&
          !tags.includes(tag)
      )
    : allTags.filter((tag) => !tags.includes(tag));

  const addTag = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && !tags.includes(normalizedTag)) {
      setTags([...tags, normalizedTag].sort());
    }
    setTagInput('');
    setShowSuggestions(false);
    tagInputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
      }
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!idea) throw new Error('No idea to update');

      // Update basic fields
      await invoke<Idea>('update_idea', {
        id: idea.id,
        title: title.trim(),
        description: description.trim(),
      });

      // Sync tags
      const originalTags = idea.tags ?? [];
      const tagsToAdd = tags.filter((t) => !originalTags.includes(t));
      const tagsToRemove = originalTags.filter((t) => !tags.includes(t));

      for (const tag of tagsToRemove) {
        await invoke<Idea>('remove_idea_tag', { id: idea.id, tag });
      }
      for (const tag of tagsToAdd) {
        await invoke<Idea>('add_idea_tag', { id: idea.id, tag });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea-tags'] });
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

  // Check if tags have changed
  const tagsChanged = idea ? (
    tags.length !== (idea.tags?.length ?? 0) ||
    tags.some((t) => !idea.tags?.includes(t))
  ) : false;

  const hasChanges = idea ? (title !== idea.title || description !== idea.description || tagsChanged) : false;

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

          <div className="space-y-2">
            <label htmlFor="edit-idea-tags" className="text-sm font-medium">
              Tags
            </label>
            <div className="relative">
              {/* Tag chips and input */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 border rounded-md bg-background min-h-[42px]">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
                      getTagColor(tag)
                    )}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:bg-black/10 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  id="edit-idea-tags"
                  type="text"
                  placeholder={tags.length === 0 ? "Add tags..." : ""}
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={handleTagInputKeyDown}
                  className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
                />
              </div>

              {/* Autocomplete suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-32 overflow-y-auto">
                  {suggestions.slice(0, 8).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          getTagColor(tag)
                        )}
                      >
                        {tag}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Press Enter to add a new tag. Use predefined tags for consistent colors.
            </p>
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
