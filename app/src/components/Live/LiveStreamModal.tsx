import React from 'react';
import { X, Trash2, ArrowDownToLine } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
} from '@/components/ui/alert-dialog';
import { useLiveOutputStore } from '../../store/liveOutputStore';
import { LiveMessageList } from './LiveMessageList';
import { AgentStatus, AGENT_DESCRIPTIONS } from '../../types';
import { cn } from '../../lib/utils';

interface LiveStreamModalProps {
  agent: AgentStatus | undefined;
}

const getAgentColor = (name: string): string => {
  const colors: Record<string, string> = {
    ana: 'text-pink-400',
    bill: 'text-blue-400',
    carl: 'text-amber-400',
    dan: 'text-violet-400',
    enzo: 'text-emerald-400',
    ralph: 'text-zinc-400',
  };
  return colors[name.toLowerCase()] || 'text-gray-400';
};

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({ agent }) => {
  const {
    selectedSession,
    closeModal,
    agentOutputs,
    clearSession,
    autoScroll,
    toggleAutoScroll,
  } = useLiveOutputStore();

  const isOpen = selectedSession !== null;
  const output = selectedSession ? agentOutputs[selectedSession] : undefined;
  const entries = output?.entries || [];
  const isActive = output?.isActive || false;

  const handleClear = () => {
    if (selectedSession) {
      clearSession(selectedSession);
    }
  };

  const description = agent?.name
    ? AGENT_DESCRIPTIONS[agent.name as keyof typeof AGENT_DESCRIPTIONS] || 'Agent'
    : 'Agent';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <AlertDialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            {/* Activity indicator */}
            <div
              className={cn(
                'w-2.5 h-2.5 rounded-full',
                isActive
                  ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                  : agent?.active
                  ? 'bg-green-500/50'
                  : 'bg-muted-foreground/40'
              )}
            />
            <div>
              <span className={cn('font-medium capitalize', agent?.name && getAgentColor(agent.name))}>
                {agent?.name || 'Unknown'}
              </span>
              <span className="text-sm text-muted-foreground ml-2">
                {description}
              </span>
              {agent?.current_project && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({agent.current_project})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Message count */}
            <span className="text-xs text-muted-foreground">
              {entries.length} messages
            </span>

            {/* Auto-scroll toggle */}
            <button
              onClick={toggleAutoScroll}
              className={cn(
                'p-1.5 rounded transition-colors',
                autoScroll
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={`Auto-scroll ${autoScroll ? 'ON' : 'OFF'}`}
            >
              <ArrowDownToLine className="w-4 h-4" />
            </button>

            {/* Clear button */}
            {entries.length > 0 && (
              <button
                onClick={handleClear}
                className="p-1.5 rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                title="Clear messages"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Close button */}
            <button
              onClick={closeModal}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-hidden">
          {entries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">Messages will appear here in real-time</p>
              </div>
            </div>
          ) : (
            <LiveMessageList entries={entries} maxHeight="100%" />
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
