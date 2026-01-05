import React, { useState } from 'react';
import { useHistoryStore } from '../../store/historyStore';
import { SessionCard } from './SessionCard';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { HistoryEntry } from '../../types';

interface AgentMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string;  // e.g., "agent-bill-3"
  agentName: string;    // e.g., "Bill" for display
}

export const AgentMessagesDialog: React.FC<AgentMessagesDialogProps> = ({
  open,
  onOpenChange,
  sessionName,
}) => {
  const { entries } = useHistoryStore();
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  // Filter entries by matching tmux_session to sessionName
  const sessionEntries = React.useMemo(() => {
    return entries.filter(entry => entry.tmux_session === sessionName);
  }, [entries, sessionName]);

  // Don't render if not open
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8"
        onClick={() => onOpenChange(false)}
      >
        {/* Session card container */}
        <div
          className="w-full max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          <SessionCard
            sessionId={sessionName}
            sessionName={sessionName}
            entries={sessionEntries}
            isExpanded={true}
            isCollapsible={false}
            onSelectEntry={setSelectedEntry}
            selectedEntryUuid={selectedEntry?.uuid || null}
            useVirtualization={false}
            autoScrollEnabled={true}
            agentStatus="offline"
          />
        </div>
      </div>

      {/* Detail popup for selected entry */}
      {selectedEntry && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="glass-card glass-active rounded-2xl w-full max-w-5xl h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popup header */}
            <div className="p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-foreground">Entry Detail</span>
                <span className="text-xs text-muted-foreground">
                  {selectedEntry.timestamp} • {selectedEntry.entry_type}
                  {selectedEntry.agent && ` • ${selectedEntry.agent}`}
                </span>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                ✕
              </button>
            </div>
            {/* Popup content */}
            <div className="flex-1 overflow-auto px-4 pb-4 min-h-0">
              {selectedEntry.entry_type.toLowerCase() === 'assistant' ? (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <MessageRenderer content={selectedEntry.message} />
                </div>
              ) : (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed break-words bg-secondary/30 rounded-xl p-4">
                  {selectedEntry.message}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
