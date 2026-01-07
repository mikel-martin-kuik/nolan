import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { useToastStore } from '../../store/toastStore';

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

    // Derive target from session: "agent-ralph-echo" -> "ralph-echo"
    // send_message expects target without "agent-" prefix
    const target = session.replace(/^agent-/, '');

    setSending(true);
    try {
      await invoke('send_message', {
        target,
        message: trimmed,
      });
      setValue('');
    } catch (err) {
      console.error('Failed to send message:', err);
      showError(`Failed to send: ${err}`);
    } finally {
      setSending(false);
    }
  }, [value, disabled, sending, session, showError]);

  const handleInterrupt = useCallback(async () => {
    try {
      await invoke('send_agent_command', {
        session,
        command: 'escape',
      });
    } catch (err) {
      console.error('Failed to interrupt:', err);
      showError(`Failed to interrupt: ${err}`);
    }
  }, [session, showError]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Send on Enter (not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm p-4">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          className={cn(
            'flex-1 resize-none rounded-xl border border-input bg-background',
            'px-4 py-3 text-sm min-h-[44px] max-h-32',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'placeholder:text-muted-foreground'
          )}
          rows={1}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || sending || !value.trim()}
          className={cn(
            'h-11 px-4 rounded-xl flex items-center justify-center',
            'bg-primary text-primary-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:bg-primary/90 transition-colors'
          )}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>

        {/* Interrupt button */}
        <button
          onClick={handleInterrupt}
          className={cn(
            'h-11 px-4 rounded-xl flex items-center justify-center',
            'bg-destructive/20 text-destructive',
            'hover:bg-destructive/30 transition-colors'
          )}
          title="Interrupt agent"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>

      {/* Hint text */}
      <p className="text-[10px] text-muted-foreground mt-2 px-1">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
