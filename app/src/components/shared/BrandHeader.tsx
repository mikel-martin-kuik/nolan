import React, { useState } from 'react';
import { Zap, LayoutGrid } from 'lucide-react';
import { QuickLaunchModal } from './QuickLaunchModal';
import { invoke, isBrowserMode } from '@/lib/api';
import { useAgentStore } from '@/store/agentStore';
import { useToastStore } from '@/store/toastStore';
import { Tooltip } from '../ui/tooltip';

export const BrandHeader: React.FC = () => {
  const [showQuickLaunch, setShowQuickLaunch] = useState(false);
  const { freeAgents } = useAgentStore();
  const { error: showError, success: showSuccess } = useToastStore();
  const showTerminalButton = !isBrowserMode();

  // Handler for opening all free agent terminals
  const handleOpenAllFreeAgentTerminals = async () => {
    try {
      const activeSessions = freeAgents
        .filter(a => a.name === 'ralph' && a.active)
        .map(a => a.session);

      if (activeSessions.length === 0) {
        showError('No Ralph agents are running');
        return;
      }

      const failures: string[] = [];
      for (const session of activeSessions) {
        try {
          await invoke('open_agent_terminal', { session });
        } catch (terminalError) {
          console.error(`Failed to open terminal for ${session}:`, terminalError);
          failures.push(`${session}: ${terminalError}`);
        }
      }
      if (failures.length > 0) {
        showError(`Failed to open some terminals:\n${failures.join('\n')}`);
      } else {
        showSuccess(`Opened ${activeSessions.length} terminal${activeSessions.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Failed to open Ralph terminals:', error);
      showError(`Failed to open Ralph terminals: ${error}`);
    }
  };

  const activeFreeAgentCount = freeAgents.filter(a => a.active).length;

  return (
    <div className="flex items-center justify-between px-2 py-2">
      {/* Logo & Brand - floating, no background */}
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-foreground/90 tracking-wide">
          NOLAN
        </span>
      </div>

      {/* Quick Launch & Terminals Buttons */}
      <div className="flex items-center gap-1.5">
        {showTerminalButton && (
          <Tooltip content="Terminals" side="bottom">
            <button
              onClick={handleOpenAllFreeAgentTerminals}
              disabled={activeFreeAgentCount === 0}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}
        <button
          onClick={() => setShowQuickLaunch(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 transition-colors text-sm font-medium"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quick</span>
        </button>
      </div>

      {/* Quick Launch Modal */}
      <QuickLaunchModal
        open={showQuickLaunch}
        onOpenChange={setShowQuickLaunch}
      />
    </div>
  );
};
