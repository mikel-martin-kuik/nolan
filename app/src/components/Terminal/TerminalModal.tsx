import { useEffect } from 'react';
import { useTerminalStore } from '@/store/terminalStore';
import { TerminalView } from './TerminalView';
import { invoke } from '@tauri-apps/api/core';
import { X, ExternalLink } from 'lucide-react';
import { FEATURES } from '@/lib/features';

/**
 * Full-screen terminal modal
 *
 * Displays an embedded terminal in a modal overlay with options to
 * close or open in an external terminal window
 */
export function TerminalModal() {
  const { selectedSession, agentName, closeModal } = useTerminalStore();

  // Handle Escape key to close modal
  useEffect(() => {
    if (!selectedSession) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedSession, closeModal]);

  if (!selectedSession || !agentName || !FEATURES.EMBEDDED_TERMINAL) {
    return null;
  }

  const handleOpenExternal = async () => {
    try {
      await invoke('open_agent_terminal', { session: selectedSession });
    } catch (err) {
      console.error('Failed to open external terminal:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{agentName}</span>
            <span className="text-sm text-muted-foreground">
              {selectedSession}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {FEATURES.EXTERNAL_TERMINAL && (
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded transition-colors"
                title="Open in external terminal"
              >
                <ExternalLink className="w-4 h-4" />
                Open External
              </button>
            )}
            <button
              onClick={closeModal}
              className="flex items-center justify-center w-8 h-8 hover:bg-secondary rounded transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Terminal View */}
        <div className="flex-1 overflow-hidden">
          <TerminalView
            session={selectedSession}
            agentName={agentName}
          />
        </div>
      </div>
    </div>
  );
}
