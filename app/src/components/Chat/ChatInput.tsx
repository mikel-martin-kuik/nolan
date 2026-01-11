import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, Loader2 } from 'lucide-react';
import { invoke } from '@/lib/api';
import { useToastStore } from '../../store/toastStore';
import { useTeamStore } from '../../store/teamStore';
import { useOllamaStore } from '../../store/ollamaStore';
import { useChatDraftStore } from '../../store/chatDraftStore';
import { Tooltip } from '@/components/ui/tooltip';

interface ChatInputProps {
  session: string;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = memo(({
  session,
  disabled = false,
  placeholder = 'Type your response...',
}) => {
  const { getDraft, setDraft, clearDraft } = useChatDraftStore();
  const value = getDraft(session);
  const setValue = useCallback((text: string) => setDraft(session, text), [session, setDraft]);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValueRef = useRef(value);
  const { error: showError } = useToastStore();
  const { currentTeam } = useTeamStore();
  const { status: ollamaStatus, checkConnection, generate: ollamaGenerate } = useOllamaStore();

  // Derive target agent from session
  const targetAgent = session.replace(/^agent-/, '');

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
    }
  }, [value]);

  // Check Ollama connection
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Fetch autocomplete suggestion (debounced)
  const fetchSuggestion = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 10 || ollamaStatus !== 'connected') {
      setSuggestion('');
      return;
    }

    setLoadingSuggestion(true);
    try {
      const systemPrompt = `You are an autocomplete assistant. Given a partial message, suggest a natural completion. Return ONLY the completion text (the part that comes after what the user typed), nothing else. Keep it concise (1-2 sentences max). If the message seems complete, return empty string.`;
      const prompt = `Complete this message for agent "${targetAgent}":\n\n"${text}"`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      const completion = result.trim();

      // Only set suggestion if the input hasn't changed
      if (lastValueRef.current === text && completion && !completion.startsWith('"')) {
        setSuggestion(completion);
      }
    } catch {
      // Silent failure for autocomplete
    } finally {
      setLoadingSuggestion(false);
    }
  }, [targetAgent, ollamaGenerate, ollamaStatus]);

  // Debounced autocomplete trigger
  useEffect(() => {
    lastValueRef.current = value;

    // Clear previous timeout
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    // Clear suggestion if value changed
    setSuggestion('');

    // Don't trigger if Ollama not connected or value too short
    if (ollamaStatus !== 'connected' || !value.trim() || value.length < 10) {
      return;
    }

    // Debounce: wait 800ms after user stops typing
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestion(value);
    }, 800);

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [value, ollamaStatus, fetchSuggestion]);

  // Accept suggestion
  const acceptSuggestion = useCallback(() => {
    if (suggestion) {
      setValue(value + suggestion);
      setSuggestion('');
    }
  }, [suggestion, value, setValue]);

  // Improve message using Ollama
  const handleImproveMessage = useCallback(async () => {
    if (!value.trim()) {
      showError('Enter a message first');
      return;
    }
    setGenerating(true);
    try {
      const systemPrompt = `You are a communication assistant. Improve this message to be clearer and more actionable. Preserve the original intent but enhance clarity. Keep the tone professional and concise. Return only the improved message, no explanations.`;
      const prompt = `Improve this message for agent "${targetAgent}":\n\n"${value}"`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      setValue(result.trim());
    } catch (err) {
      showError(`Failed to improve: ${err}`);
    } finally {
      setGenerating(false);
    }
  }, [value, targetAgent, ollamaGenerate, showError]);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) return;

    setSending(true);
    try {
      await invoke('send_message', {
        team: currentTeam?.team.name ?? 'default',
        target: targetAgent,
        message: trimmed,
      });
      clearDraft(session);
    } catch (err) {
      console.error('Failed to send message:', err);
      showError(`Failed to send: ${err}`);
    } finally {
      setSending(false);
    }
  }, [value, disabled, sending, targetAgent, currentTeam, showError, clearDraft, session]);

  const handleInterrupt = useCallback(async () => {
    try {
      await invoke('send_agent_command', {
        session: session,
        command: 'escape',
      });
    } catch (err) {
      console.error('Failed to interrupt:', err);
      showError(`Failed to interrupt: ${err}`);
    }
  }, [session, showError]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Accept suggestion on Tab
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }

    // Send on Ctrl+Enter (or Cmd+Enter on Mac)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }

    // Dismiss suggestion on Escape
    if (e.key === 'Escape' && suggestion) {
      e.preventDefault();
      setSuggestion('');
    }
  }, [handleSend, suggestion, acceptSuggestion]);

  return (
    <div className="border-t border-border p-4 flex-shrink-0">
      <div className="flex items-end gap-3">
        {/* Textarea with ghost text overlay */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending || generating}
            className="w-full min-h-[44px] max-h-32 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={1}
          />
          {/* Ghost text suggestion overlay */}
          {suggestion && (
            <div
              className="absolute top-0 left-0 right-0 px-3 py-2 text-sm pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
              style={{ lineHeight: 'inherit' }}
            >
              <span className="invisible">{value}</span>
              <span className="text-muted-foreground/50">{suggestion}</span>
            </div>
          )}
          {/* Loading indicator for suggestion */}
          {loadingSuggestion && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 className="w-3 h-3 animate-spin text-purple-400/50" />
            </div>
          )}
        </div>

        {/* Improve with AI button */}
        {ollamaStatus === 'connected' && (
          <Tooltip content="Improve message using local AI" side="top">
            <button
              onClick={handleImproveMessage}
              disabled={disabled || sending || generating || !value.trim()}
              title="Improve with AI"
              className="w-11 h-11 rounded-xl flex items-center justify-center
                bg-purple-500/15 border border-purple-400/30 text-purple-500
                hover:bg-purple-500/25 hover:border-purple-400/50
                active:scale-95 transition-all duration-200
                disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-purple-500/15 disabled:hover:border-purple-400/30"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        )}

        {/* Send button - styled like team launch button */}
        <button
          onClick={handleSend}
          disabled={disabled || sending || generating || !value.trim()}
          title="Send message"
          className="w-11 h-11 rounded-xl flex items-center justify-center
            bg-emerald-500/15 border border-emerald-400/30 text-emerald-500
            hover:bg-emerald-500/25 hover:border-emerald-400/50
            active:scale-95 transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-500/15 disabled:hover:border-emerald-400/30"
        >
          <Send className="w-4 h-4" />
        </button>

        {/* Interrupt button - styled like team kill button */}
        <button
          onClick={handleInterrupt}
          title="Interrupt agent"
          className="w-11 h-11 rounded-xl flex items-center justify-center
            bg-secondary/50 border border-border text-muted-foreground
            hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-500
            active:scale-95 transition-all duration-200"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 px-1">
        Ctrl+Enter to send{ollamaStatus === 'connected' && ', Tab to accept suggestion'}
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
