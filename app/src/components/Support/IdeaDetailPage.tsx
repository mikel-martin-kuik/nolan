import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { invoke } from '@/lib/api';
import {
  Idea,
  IdeaReview,
  IdeaProposal,
  IdeaGap,
  COMPLEXITY_LABELS,
} from '@/types';
import { Loader2, Check } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';

interface IdeaDetailPageProps {
  idea: Idea;
  review?: IdeaReview;
  onBack: () => void;
}

export function IdeaDetailPage({ idea, review, onBack }: IdeaDetailPageProps) {
  const queryClient = useQueryClient();
  const toast = useToastStore();

  // Editing states
  const [editingOriginal, setEditingOriginal] = useState(false);
  const [editingProposal, setEditingProposal] = useState(false);

  // Form states
  const [originalTitle, setOriginalTitle] = useState(idea.title);
  const [originalDescription, setOriginalDescription] = useState(idea.description);
  const [proposal, setProposal] = useState<IdeaProposal | null>(review?.proposal || null);
  const [gaps, setGaps] = useState<IdeaGap[]>(review?.gaps || []);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedGapsRef = useRef<string>(JSON.stringify(review?.gaps || []));

  // Sync with props (only when review changes from server, not our own saves)
  useEffect(() => {
    setOriginalTitle(idea.title);
    setOriginalDescription(idea.description);
    setProposal(review?.proposal || null);
    // Only reset gaps if they changed from server (not from our save)
    const serverGaps = JSON.stringify(review?.gaps || []);
    if (serverGaps !== lastSavedGapsRef.current) {
      setGaps(review?.gaps || []);
      lastSavedGapsRef.current = serverGaps;
    }
  }, [idea, review]);

  // Mutations
  const updateIdeaMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      invoke<Idea>('update_idea', { id: idea.id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      setEditingOriginal(false);
    },
  });

  const updateProposalMutation = useMutation({
    mutationFn: (updatedProposal: IdeaProposal) =>
      invoke<IdeaReview>('update_review_proposal', { itemId: idea.id, proposal: updatedProposal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      setEditingProposal(false);
    },
  });

  const updateGapsMutation = useMutation({
    mutationFn: (updatedGaps: IdeaGap[]) =>
      invoke<IdeaReview>('update_review_gaps', { itemId: idea.id, gaps: updatedGaps }),
    onSuccess: (result) => {
      lastSavedGapsRef.current = JSON.stringify(result.gaps);
      setSaveStatus('saved');
      // Clear saved indicator after 2s
      setTimeout(() => setSaveStatus('idle'), 2000);
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
    },
    onError: (error) => {
      setSaveStatus('error');
      toast.error(`Failed to save: ${error}`);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      // Save gaps first to ensure they're persisted before accepting
      await invoke<IdeaReview>('update_review_gaps', { itemId: idea.id, gaps });
      return invoke<{ review: IdeaReview; route: string; route_detail: string }>('accept_and_route_review', { itemId: idea.id });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['idea-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (result.route === 'project') {
        toast.success(`Created project: ${result.route_detail}`);
      } else {
        toast.success(`Idea accepted and queued for implementation`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to accept proposal: ${error}`);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => invoke<Idea>('update_idea_status', { id: idea.id, status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      onBack();
    },
  });

  // Debounced auto-save for gaps
  const debouncedSave = useCallback((gapsToSave: IdeaGap[]) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');

    // Save after 1 second of no typing
    saveTimeoutRef.current = setTimeout(() => {
      updateGapsMutation.mutate(gapsToSave);
    }, 1000);
  }, [updateGapsMutation]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleGapChange = (gapId: string, value: string) => {
    const updated = gaps.map((g) =>
      g.id === gapId ? { ...g, value: value || undefined } : g
    );
    setGaps(updated);
    debouncedSave(updated);
  };

  const handleSaveOriginal = () => {
    updateIdeaMutation.mutate({
      title: originalTitle,
      description: originalDescription,
    });
  };

  const handleSaveProposal = () => {
    if (proposal) {
      updateProposalMutation.mutate(proposal);
    }
  };

  const allRequiredFilled = gaps.every((g) => !g.required || (g.value && g.value.trim()));
  const isReady = review?.review_status === 'ready';
  const isRejected = review?.review_status === 'rejected';
  const isAccepted = !!review?.accepted_at;
  const isArchived = idea.status === 'archived';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs h-7 px-2">
          Back
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {isAccepted && (
            <span className="text-xs text-muted-foreground">Accepted</span>
          )}
          {isRejected && (
            <span className="text-xs text-muted-foreground">Not feasible</span>
          )}
          {!isArchived && !isAccepted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="text-xs"
            >
              Archive
            </Button>
          )}
          {review && !isAccepted && !isRejected && (
            <Button
              size="sm"
              onClick={() => acceptMutation.mutate()}
              disabled={!allRequiredFilled || acceptMutation.isPending}
              className="text-xs"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Accept Proposal
            </Button>
          )}
        </div>
      </div>

      {/* Content - Two columns: Left (Original + Analysis + Questions) | Right (Spec) */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Left Column: Original, Analysis, Questions */}
          <div className="flex flex-col gap-4 h-full">
            {/* Original Idea */}
            <div className="glass-card no-hover rounded-xl p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Original Idea
                </h2>
                {!editingOriginal && (
                  <button
                    onClick={() => setEditingOriginal(true)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                {editingOriginal ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Title
                      </label>
                      <Input
                        value={originalTitle}
                        onChange={(e) => setOriginalTitle(e.target.value)}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Description
                      </label>
                      <Textarea
                        value={originalDescription}
                        onChange={(e) => setOriginalDescription(e.target.value)}
                        className="mt-1 text-xs min-h-[80px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveOriginal}
                        disabled={updateIdeaMutation.isPending}
                        className="flex-1"
                      >
                        {updateIdeaMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOriginalTitle(idea.title);
                          setOriginalDescription(idea.description);
                          setEditingOriginal(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-sm font-medium">{idea.title}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(idea.created_at).toLocaleDateString()}
                        {idea.updated_at && ' (edited)'}
                        {isArchived && ' · Archived'}
                      </p>
                    </div>
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                      {idea.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis */}
            <div className="glass-card no-hover rounded-xl p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Analysis
                </h2>
                {review?.complexity && (
                  <span className="text-[10px] text-muted-foreground">
                    {COMPLEXITY_LABELS[review.complexity]} complexity
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                {!review ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Awaiting analysis...
                  </div>
                ) : (
                  <p className="text-xs text-foreground/80">{review.analysis}</p>
                )}
              </div>
            </div>

            {/* Questions / Gaps */}
            <div className="glass-card no-hover rounded-xl p-4 flex flex-col overflow-hidden flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Questions
                </h2>
                <div className="flex items-center gap-2">
                  {gaps.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {gaps.filter((g) => g.value?.trim()).length}/{gaps.length} filled
                    </span>
                  )}
                  {gaps.length > 0 && !isReady && !isRejected && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {saveStatus === 'saving' && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Saving...</span>
                        </>
                      )}
                      {saveStatus === 'saved' && (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          <span className="text-green-500">Saved</span>
                        </>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-destructive">Save failed</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {gaps.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    {review ? 'No questions' : 'Awaiting analysis...'}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {gaps.map((gap) => (
                      <div key={gap.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium">
                            {gap.label}
                            {gap.required && <span className="text-destructive ml-0.5">*</span>}
                          </label>
                          {gap.value && gap.value.trim() && (
                            <span className="text-[10px] text-muted-foreground">filled</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{gap.description}</p>
                        <Textarea
                          value={gap.value || ''}
                          onChange={(e) => handleGapChange(gap.id, e.target.value)}
                          placeholder={gap.placeholder}
                          rows={2}
                          className="text-xs"
                          disabled={isReady || isRejected}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Proposed Spec (full height) */}
          <div className="glass-card no-hover rounded-xl p-4 flex flex-col overflow-hidden h-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Proposed Spec
              </h2>
              {proposal && !isReady && !isRejected && !editingProposal && (
                <button
                  onClick={() => setEditingProposal(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {!proposal ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Awaiting analysis...
                </div>
              ) : editingProposal ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Title
                    </label>
                    <Input
                      value={proposal.title}
                      onChange={(e) => setProposal({ ...proposal, title: e.target.value })}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Summary
                    </label>
                    <Textarea
                      value={proposal.summary}
                      onChange={(e) => setProposal({ ...proposal, summary: e.target.value })}
                      rows={2}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Problem
                    </label>
                    <Textarea
                      value={proposal.problem}
                      onChange={(e) => setProposal({ ...proposal, problem: e.target.value })}
                      rows={3}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Solution
                    </label>
                    <Textarea
                      value={proposal.solution}
                      onChange={(e) => setProposal({ ...proposal, solution: e.target.value })}
                      rows={4}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Scope
                    </label>
                    <Textarea
                      value={proposal.scope || ''}
                      onChange={(e) => setProposal({ ...proposal, scope: e.target.value || undefined })}
                      rows={2}
                      className="mt-1 text-xs"
                      placeholder="What's in and out of scope..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Implementation Hints
                    </label>
                    <Textarea
                      value={proposal.implementation_hints || ''}
                      onChange={(e) => setProposal({ ...proposal, implementation_hints: e.target.value || undefined })}
                      rows={2}
                      className="mt-1 text-xs font-mono"
                      placeholder="Technical notes..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveProposal}
                      disabled={updateProposalMutation.isPending}
                      className="flex-1"
                    >
                      {updateProposalMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProposal(review?.proposal || null);
                        setEditingProposal(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium">{proposal.title}</div>
                    <p className="text-xs text-muted-foreground mt-1">{proposal.summary}</p>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                      Problem
                    </div>
                    <p className="text-xs text-foreground/80">{proposal.problem}</p>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                      Solution
                    </div>
                    <p className="text-xs text-foreground/80">{proposal.solution}</p>
                  </div>
                  {proposal.scope && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        Scope
                      </div>
                      <p className="text-xs text-foreground/80">{proposal.scope}</p>
                    </div>
                  )}
                  {proposal.implementation_hints && (
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        Implementation Hints
                      </div>
                      <p className="text-xs text-foreground/80 font-mono">
                        {proposal.implementation_hints}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
