import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { invoke } from '@/lib/api';
import { useToastStore } from '../../store/toastStore';
import { useTeamStore } from '../../store/teamStore';
import { Textarea } from '@/components/ui/textarea';

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
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { error: showError } = useToastStore();
  const { currentTeam } = useTeamStore();

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
      setValue('');
    } catch (err) {
      console.error('Failed to send message:', err);
      showError(`Failed to send: ${err}`);
    } finally {
      setSending(false);
    }
  }, [value, disabled, sending, targetAgent, currentTeam, showError]);

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
    // Send on Ctrl+Enter (or Cmd+Enter on Mac)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm p-4">
      <div className="flex items-end gap-3">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="flex-1 min-h-[44px] max-h-32"
          rows={1}
        />

        {/* Send button - styled like team launch button */}
        <button
          onClick={handleSend}
          disabled={disabled || sending || !value.trim()}
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
        Press Ctrl+Enter to send, Enter for new line
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
