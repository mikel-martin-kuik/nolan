import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@/lib/api';
import { Send, X, Globe, Zap } from 'lucide-react';
import { CLAUDE_MODELS, type ClaudeModel } from '@/types';
import { isBrowserMode } from '@/lib/api';
import { useAgentStore } from '@/store/agentStore';
import { useToastStore } from '@/store/toastStore';
import { getRalphDisplayName } from '@/lib/agentIdentity';

interface QuickLaunchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const QuickLaunchModal: React.FC<QuickLaunchModalProps> = ({
  open,
  onOpenChange,
}) => {
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>('opus');
  const [chromeEnabled, setChromeEnabled] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const showChromeOption = !isBrowserMode();

  const { spawnAgent, freeAgents } = useAgentStore();
  const { error: showError, success: showSuccess } = useToastStore();
  const ralphDisplayName = getRalphDisplayName();

  // Focus message input when modal opens
  useEffect(() => {
    if (open) {
      // Reset state when opening
      setSelectedModel('opus');
      setChromeEnabled(false);
      setMessageText('');
      // Focus after a short delay to ensure the modal is rendered
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle launch with message
  const handleLaunch = async () => {
    if (!messageText.trim()) {
      // If no message, just spawn without message
      setIsLaunching(true);
      try {
        await spawnAgent('', 'ralph', false, selectedModel, showChromeOption ? chromeEnabled : undefined);
        onOpenChange(false);
      } catch (error) {
        showError(`Failed to spawn ${ralphDisplayName}: ${error}`);
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    setIsLaunching(true);
    try {
      // Get current ralph sessions before spawning
      const beforeSessions = new Set(
        freeAgents
          .filter(a => a.name === 'ralph' && a.active)
          .map(a => a.session)
      );

      // Spawn the agent
      await spawnAgent('', 'ralph', false, selectedModel, showChromeOption ? chromeEnabled : undefined);

      // Wait for the new session to appear (poll for up to 10 seconds)
      const maxAttempts = 20;
      let newSession: string | null = null;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch fresh status
        const status = await invoke<{ team: unknown[]; free: Array<{ name: string; active: boolean; session: string }> }>('get_agent_status');

        // Find the new session
        const currentSessions = status.free
          .filter(a => a.name === 'ralph' && a.active)
          .map(a => a.session);

        const newSessions = currentSessions.filter(s => !beforeSessions.has(s));
        if (newSessions.length > 0) {
          newSession = newSessions[0];
          break;
        }
      }

      if (newSession) {
        // Send the message to the new session
        const target = newSession.replace('agent-', ''); // ralph-{name}
        await invoke<string>('send_message', { team: '', target, message: messageText });
        showSuccess(`${ralphDisplayName} launched with message`);
      } else {
        showSuccess(`${ralphDisplayName} launched (message not sent - session detection timeout)`);
      }

      onOpenChange(false);
    } catch (error) {
      showError(`Failed to launch ${ralphDisplayName}: ${error}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleLaunch();
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isLaunching && onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-xl shadow-lg p-4 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Quick Launch {ralphDisplayName}
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isLaunching}
            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chrome DevTools Toggle - Desktop only */}
        {showChromeOption && (
          <button
            onClick={() => setChromeEnabled(!chromeEnabled)}
            disabled={isLaunching}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-150 text-left mb-3
              ${chromeEnabled
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                : 'border-border/40 hover:border-border/60 text-muted-foreground'
              }
              ${isLaunching ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Globe className={`w-4 h-4 ${chromeEnabled ? 'text-blue-400' : 'text-muted-foreground/50'}`} />
            <div className="flex-1">
              <div className="text-sm font-medium">Chrome DevTools</div>
              <div className="text-xs text-muted-foreground/60">Browser automation & debugging</div>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors ${chromeEnabled ? 'bg-blue-500' : 'bg-muted'}`}>
              <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${chromeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        )}

        {/* Model Selection */}
        <div className="flex gap-2 mb-4">
          {CLAUDE_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => setSelectedModel(model.id)}
              disabled={isLaunching}
              className={`flex-1 px-3 py-2 rounded-lg border transition-colors duration-150 text-center
                ${selectedModel === model.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/40 hover:border-border/60 text-muted-foreground hover:text-foreground'
                }
                ${isLaunching ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div className="text-sm font-medium">{model.label}</div>
              <div className="text-xs text-muted-foreground/60">{model.hint}</div>
            </button>
          ))}
        </div>

        {/* Message Input */}
        <textarea
          ref={messageInputRef}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What should the agent work on? (optional)"
          rows={4}
          className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          disabled={isLaunching}
        />

        {/* Footer */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            {messageText.trim() ? 'Ctrl+Enter to launch' : 'Launch without message'}
          </span>
          <button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="px-4 py-2 rounded-lg flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <Send className="w-4 h-4" />
            {isLaunching ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
