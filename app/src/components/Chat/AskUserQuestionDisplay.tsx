import React, { useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Circle, Send, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { useTeamStore } from '../../store/teamStore';

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface AskUserQuestionInput {
  questions: Question[];
}

interface AskUserQuestionDisplayProps {
  content: string;
  className?: string;
  showNeedsResponse?: boolean;
  isLast?: boolean;
  /** Session name for sending responses (e.g., "agent-ana") */
  session?: string;
  /** Whether interactive selection is enabled */
  interactive?: boolean;
}

/**
 * Parse AskUserQuestion tool use content from JSON string or formatted text
 */
function parseAskUserQuestionContent(content: string): AskUserQuestionInput | null {
  try {
    // First try direct JSON parse
    const parsed = JSON.parse(content);
    if (parsed.questions && Array.isArray(parsed.questions)) {
      return parsed as AskUserQuestionInput;
    }
  } catch {
    // Not direct JSON
  }

  // Try to extract JSON from the content (might be prefixed with tool name)
  const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.questions && Array.isArray(parsed.questions)) {
        return parsed as AskUserQuestionInput;
      }
    } catch {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Get target agent name from session (e.g., "agent-ana" → "ana")
 */
function getTargetFromSession(session: string): string {
  return session.replace(/^agent-/, '');
}

export const AskUserQuestionDisplay: React.FC<AskUserQuestionDisplayProps> = ({
  content,
  className,
  showNeedsResponse = true,
  isLast = false,
  session,
  interactive = false,
}) => {
  const parsed = parseAskUserQuestionContent(content);

  // Track selections per question (questionIndex -> Set of optionIndices)
  const [selections, setSelections] = useState<Map<number, Set<number>>>(new Map());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { currentTeam } = useTeamStore();

  const canInteract = interactive && session && isLast && !sent;

  const handleOptionClick = useCallback((questionIndex: number, optionIndex: number, multiSelect: boolean) => {
    if (!canInteract) return;

    setSelections(prev => {
      const newSelections = new Map(prev);
      const questionSelections = new Set(prev.get(questionIndex) || []);

      if (multiSelect) {
        // Toggle selection for multi-select
        if (questionSelections.has(optionIndex)) {
          questionSelections.delete(optionIndex);
        } else {
          questionSelections.add(optionIndex);
        }
      } else {
        // Single select - replace selection
        questionSelections.clear();
        questionSelections.add(optionIndex);
      }

      newSelections.set(questionIndex, questionSelections);
      return newSelections;
    });
  }, [canInteract]);

  const handleSend = useCallback(async () => {
    if (!canInteract || !parsed || !session) return;

    // Build response message from selections
    const responses: string[] = [];

    parsed.questions.forEach((question, qIndex) => {
      const selected = selections.get(qIndex);
      if (selected && selected.size > 0) {
        const selectedLabels = Array.from(selected)
          .map(idx => question.options[idx]?.label)
          .filter(Boolean);

        if (selectedLabels.length > 0) {
          responses.push(selectedLabels.join(', '));
        }
      }
    });

    if (responses.length === 0) return;

    const message = responses.join('\n');
    const target = getTargetFromSession(session);

    setSending(true);
    try {
      await invoke('send_message', { team: currentTeam?.team.name ?? 'default', target, message });
      setSent(true);
    } catch (err) {
      console.error('Failed to send response:', err);
    } finally {
      setSending(false);
    }
  }, [canInteract, parsed, session, selections, currentTeam]);

  // Check if any selection has been made
  const hasSelection = Array.from(selections.values()).some(s => s.size > 0);

  if (!parsed) {
    // Fallback to raw content if parsing fails
    return (
      <div className={cn('font-mono text-xs whitespace-pre-wrap', className)}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {parsed.questions.map((question, qIndex) => {
        const questionSelections = selections.get(qIndex) || new Set();

        return (
          <div key={qIndex} className="space-y-2">
            {/* Header badge */}
            {question.header && (
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-yellow-500/20 text-yellow-400">
                {question.header}
              </span>
            )}

            {/* Question text */}
            <p className="text-sm font-medium text-foreground">
              {question.question}
            </p>

            {/* Multi-select indicator */}
            {question.multiSelect && (
              <p className="text-xs text-muted-foreground italic">
                Select multiple options
              </p>
            )}

            {/* Options */}
            <div className="space-y-1.5 ml-1">
              {question.options.map((option, oIndex) => {
                const isSelected = questionSelections.has(oIndex);
                const isClickable = canInteract;

                return (
                  <button
                    key={oIndex}
                    onClick={() => handleOptionClick(qIndex, oIndex, question.multiSelect || false)}
                    disabled={!isClickable}
                    className={cn(
                      'flex items-start gap-2 p-2 rounded-md w-full text-left transition-all',
                      isClickable
                        ? 'cursor-pointer hover:bg-secondary/80'
                        : 'cursor-default',
                      isSelected
                        ? 'bg-primary/20 ring-2 ring-primary/50'
                        : 'bg-secondary/40',
                      sent && 'opacity-60'
                    )}
                  >
                    {question.multiSelect ? (
                      <CheckCircle
                        className={cn(
                          'w-4 h-4 mt-0.5 shrink-0 transition-colors',
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                    ) : (
                      <Circle
                        className={cn(
                          'w-4 h-4 mt-0.5 shrink-0 transition-colors',
                          isSelected ? 'text-primary fill-primary' : 'text-muted-foreground'
                        )}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}>
                        {option.label}
                      </p>
                      {option.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Send button or status */}
      {canInteract && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleSend}
            disabled={!hasSelection || sending}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              hasSelection
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            )}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Response
              </>
            )}
          </button>
          {!hasSelection && (
            <span className="text-xs text-muted-foreground">
              Select an option to respond
            </span>
          )}
        </div>
      )}

      {/* Sent confirmation */}
      {sent && (
        <div className="flex items-center gap-1.5 text-green-400 pt-2">
          <CheckCircle className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Response sent</span>
        </div>
      )}

      {/* Needs response indicator (when not interactive) */}
      {showNeedsResponse && isLast && !canInteract && !sent && (
        <div className="flex items-center gap-1.5 text-yellow-400 pt-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Waiting for your response</span>
        </div>
      )}
    </div>
  );
};

/**
 * Check if content is an AskUserQuestion tool use
 */
export function isAskUserQuestionContent(content: string): boolean {
  return parseAskUserQuestionContent(content) !== null;
}
