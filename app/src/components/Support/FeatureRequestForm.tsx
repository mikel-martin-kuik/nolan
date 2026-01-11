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
import { FeatureRequest } from '@/types';
import { Loader2, Sparkles } from 'lucide-react';
import { useOllamaStore } from '@/store/ollamaStore';
import { Tooltip } from '@/components/ui/tooltip';
import { useToastStore } from '@/store/toastStore';

interface FeatureRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeatureRequestForm({ open, onOpenChange }: FeatureRequestFormProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const { status: ollamaStatus, checkConnection, generate: ollamaGenerate } = useOllamaStore();
  const { error: showError } = useToastStore();

  // Check Ollama connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleGenerateDescription = async () => {
    if (!title.trim()) {
      showError('Enter a title first');
      return;
    }
    setGenerating(true);
    try {
      const systemPrompt = `You are a product manager assistant. Expand this feature request description to be more detailed and actionable. Include: problem statement, proposed solution, expected benefits, and acceptance criteria.`;
      const prompt = `Improve this feature request description for: "${title}"${description.trim() ? `\n\nCurrent description: "${description}"` : ''}`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      setDescription(result.trim());
    } catch (err) {
      showError(`Failed to generate: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      invoke<FeatureRequest>('create_feature_request', {
        title: title.trim(),
        description: description.trim(),
        author: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
      setTitle('');
      setDescription('');
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && description.trim()) {
      createMutation.mutate();
    }
  };

  const isValid = title.trim().length > 0 && description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Feature Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              placeholder="Short, descriptive title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/100
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              {ollamaStatus === 'connected' && (
                <Tooltip content="Improve description using local AI" side="top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={generating || createMutation.isPending || !title.trim()}
                    className="h-6 px-2"
                  >
                    {generating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </Button>
                </Tooltip>
              )}
            </div>
            <Textarea
              id="description"
              placeholder="Describe the feature you'd like to see..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/2000
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
              disabled={!isValid || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
