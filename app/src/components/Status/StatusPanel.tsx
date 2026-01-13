import React, { useEffect, useState, useMemo } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useToastStore } from '../../store/toastStore';
import { AgentCard } from '../shared/AgentCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../ui/tooltip';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Users, Plus, XCircle, LayoutGrid } from 'lucide-react';
import { invoke, isBrowserMode } from '@/lib/api';
import { getRalphDisplayName, parseRalphSession } from '@/lib/agentIdentity';
import { QuickLaunchModal } from '../shared/QuickLaunchModal';

export const StatusPanel: React.FC = () => {
  const {
    freeAgents,
    updateStatus,
    killAllInstances,
    loading,
    setupEventListeners
  } = useAgentStore();
  const { error: showError, success: showSuccess } = useToastStore();

  // Confirmation dialog states
  const [showKillRalphDialog, setShowKillRalphDialog] = useState(false);
  const [showModelSelectDialog, setShowModelSelectDialog] = useState(false);

  // Get visual display name for ralph (persisted fun name)
  const ralphDisplayName = getRalphDisplayName();

  // Setup event listeners and auto-refresh status
  useEffect(() => {
    updateStatus();

    // Setup event listeners in async IIFE with error handling
    (async () => {
      try {
        await setupEventListeners();
      } catch (err) {
        console.error('Failed to setup event listeners:', err);
      }
    })();

    // Still poll every 2s as fallback, but events will provide real-time updates
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [updateStatus, setupEventListeners]);

  // Extract ralph names from free agents for display (memoized)
  // Ralph sessions are agent-ralph-{name} (e.g., agent-ralph-ziggy)
  const freeAgentsWithNames = useMemo(() => {
    return freeAgents.map(agent => {
      const ralphName = parseRalphSession(agent.session);
      return { ...agent, ralphName };
    }).sort((a, b) => {
      // Sort by creation timestamp to maintain order (oldest first)
      if (a.created_at && b.created_at) {
        return a.created_at - b.created_at;
      }
      return 0;
    });
  }, [freeAgents]);

  // Handler for showing quick launch modal for Ralph
  const handleSpawnRalphClick = () => {
    setShowModelSelectDialog(true);
  };

  // Handler for killing all Ralph instances
  const handleKillAllRalph = () => {
    setShowKillRalphDialog(true);
  };

  const handleConfirmKillRalph = async () => {
    try {
      // Ralph is team-independent, use empty team name
      await killAllInstances('', 'ralph');
    } catch (error) {
      console.error(`Failed to kill ${ralphDisplayName} instances:`, error);
      showError(`Failed to kill ${ralphDisplayName} instances: ${error}`);
    }
  };

  // Handler for opening all Ralph terminals
  const handleOpenAllRalphTerminals = async () => {
    try {
      // Get all Ralph sessions (from free agents)
      const ralphSessions = freeAgents
        .filter(a => a.name === 'ralph' && a.active)
        .map(a => a.session);

      if (ralphSessions.length === 0) {
        showError(`No ${ralphDisplayName} agents are running`);
        return;
      }

      // Open terminal for each session
      const failures: string[] = [];
      for (const session of ralphSessions) {
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
        showSuccess(`Opened ${ralphSessions.length} terminal${ralphSessions.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error(`Failed to open ${ralphDisplayName} terminals:`, error);
      showError(`Failed to open ${ralphDisplayName} terminals: ${error}`);
    }
  };

  return (
    <div className="h-full">
      <div className="w-full h-full flex flex-col">
        {/* Ralph - Free Agents */}
        <div className="flex-shrink-0 pt-4">
          {/* Header with controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
            <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-secondary/30 border border-border/40">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Free Agents</span>
              {freeAgents.filter(a => a.active).length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                  {freeAgents.filter(a => a.active).length}
                </Badge>
              )}
            </div>

            {/* Control buttons inline */}
            <div className="flex gap-1.5">
              <Tooltip content="Kill All" side="bottom">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleKillAllRalph}
                  disabled={loading || freeAgents.filter(a => a.active).length === 0}
                  className="w-8 h-8 rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
              {!isBrowserMode() && (
                <Tooltip content="Terminals" side="bottom">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenAllRalphTerminals}
                    disabled={loading || freeAgents.filter(a => a.active).length === 0}
                    className="w-8 h-8 rounded-lg"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Free Agent Cards - responsive grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 lg:gap-3">
            {freeAgentsWithNames
              .filter(agent => agent.active)
              .map((agent) => (
                <AgentCard
                  key={agent.session}
                  agent={agent}
                  variant="dashboard"
                  showActions={true}
                  ralphName={agent.ralphName}
                />
              ))}

            {/* Spawn Ralph Button */}
            <Button
              variant="outline"
              onClick={handleSpawnRalphClick}
              disabled={loading}
              className="w-full h-full min-h-[80px] py-4 rounded-xl border-dashed hover:border-purple-400/40"
              aria-label={`Spawn new ${ralphDisplayName} instance`}
            >
              <Plus className="w-6 h-6 text-foreground/50" />
            </Button>
          </div>
        </div>

      </div>

      {/* Kill All Ralph confirmation dialog */}
      <ConfirmDialog
        open={showKillRalphDialog}
        onOpenChange={setShowKillRalphDialog}
        title="Kill All Free Agents"
        description={`This will terminate all ${ralphDisplayName} instances. Are you sure?`}
        confirmLabel="Kill All"
        cancelLabel="Cancel"
        onConfirm={handleConfirmKillRalph}
        variant="destructive"
      />

      {/* Quick launch modal for Ralph */}
      <QuickLaunchModal
        open={showModelSelectDialog}
        onOpenChange={setShowModelSelectDialog}
      />
    </div>
  );
};
