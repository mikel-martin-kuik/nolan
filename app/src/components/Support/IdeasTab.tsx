import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { invoke } from '@/lib/api';
import { Idea } from '@/types';
import { IdeaCard } from './IdeaCard';
import { IdeaForm } from './IdeaForm';
import { Loader2 } from 'lucide-react';

export function IdeasTab() {
  const [formOpen, setFormOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => invoke<Idea[]>('list_ideas'),
    refetchInterval: 30000,
  });

  const filteredIdeas = useMemo(() => {
    if (showArchived) {
      return ideas;
    }
    return ideas.filter((i) => i.status === 'active');
  }, [ideas, showArchived]);

  const archivedCount = ideas.filter((i) => i.status === 'archived').length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setFormOpen(true)}>
          New Idea
        </Button>

        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
        <label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
          Archived ({archivedCount})
        </label>
      </div>

      {/* Ideas List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredIdeas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {ideas.length === 0
            ? 'No ideas yet'
            : 'No active ideas'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}

      <IdeaForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
