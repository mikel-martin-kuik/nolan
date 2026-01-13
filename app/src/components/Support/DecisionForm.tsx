import { useState } from 'react';
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
import { TeamDecision } from '@/types';
import { Loader2 } from 'lucide-react';

interface DecisionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DecisionForm({ open, onOpenChange }: DecisionFormProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState('agent-design');
  const [agentId, setAgentId] = useState('');
  const [problem, setProblem] = useState('');
  const [proposedSolution, setProposedSolution] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [impact, setImpact] = useState('');
  const [scope, setScope] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      invoke<TeamDecision>('create_decision', {
        team_id: teamId.trim(),
        title: title.trim(),
        problem: problem.trim(),
        proposed_solution: proposedSolution.trim(),
        alternatives: alternatives.trim() ? alternatives.split('\n').map(a => a.trim()).filter(Boolean) : [],
        rationale: rationale.trim(),
        impact: impact.trim(),
        scope: scope.trim(),
        agent_id: agentId.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
      resetForm();
      onOpenChange(false);
    },
  });

  const resetForm = () => {
    setTitle('');
    setTeamId('agent-design');
    setAgentId('');
    setProblem('');
    setProposedSolution('');
    setRationale('');
    setAlternatives('');
    setImpact('');
    setScope('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && problem.trim() && proposedSolution.trim()) {
      createMutation.mutate();
    }
  };

  const isValid = title.trim().length > 0 && problem.trim().length > 0 && proposedSolution.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Design Decision</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="decision-title" className="text-sm font-medium">
              Title *
            </label>
            <Input
              id="decision-title"
              placeholder="Short summary of the decision"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="decision-team" className="text-sm font-medium">
                Area/Team *
              </label>
              <Input
                id="decision-team"
                placeholder="e.g., agent-design, workflow"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="decision-agent" className="text-sm font-medium">
                Agent (optional)
              </label>
              <Input
                id="decision-agent"
                placeholder="e.g., ralph, dan"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="decision-problem" className="text-sm font-medium">
              Problem *
            </label>
            <Textarea
              id="decision-problem"
              placeholder="What problem does this decision address?"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="decision-solution" className="text-sm font-medium">
              Proposed Solution *
            </label>
            <Textarea
              id="decision-solution"
              placeholder="What is the chosen approach?"
              value={proposedSolution}
              onChange={(e) => setProposedSolution(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="decision-rationale" className="text-sm font-medium">
              Rationale
            </label>
            <Textarea
              id="decision-rationale"
              placeholder="Why was this approach chosen?"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="decision-alternatives" className="text-sm font-medium">
              Alternatives Considered
            </label>
            <Textarea
              id="decision-alternatives"
              placeholder="One per line: other approaches that were rejected"
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="decision-impact" className="text-sm font-medium">
                Impact
              </label>
              <Input
                id="decision-impact"
                placeholder="e.g., low, medium, high"
                value={impact}
                onChange={(e) => setImpact(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="decision-scope" className="text-sm font-medium">
                Scope
              </label>
              <Input
                id="decision-scope"
                placeholder="e.g., global, team-specific"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                maxLength={100}
              />
            </div>
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
                  Adding...
                </>
              ) : (
                'Add Decision'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
