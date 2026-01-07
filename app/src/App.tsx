import { useState, useEffect } from 'react';
import { Home, FolderOpen, DollarSign, MessageCircle, Users } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './lib/theme';
import { AppErrorBoundary } from './components/shared/AppErrorBoundary';
import { StatusPanel } from './components/Status/StatusPanel';
import { ProjectsPanel } from './components/Projects/ProjectsPanel';
import { UsagePanel } from './components/Usage/UsagePanel';
import { TeamsPanel } from './components/Teams';
import { ChatView } from './components/Chat';
import { ToastContainer } from './components/shared/Toast';
import { TerminalModal } from './components/Terminal/TerminalModal';
import { BrandHeader } from './components/shared/BrandHeader';
import { ThemeToggle } from './components/shared/ThemeToggle';
import { useToastStore } from './store/toastStore';
import { useLiveOutputStore } from './store/liveOutputStore';
import { useTeamStore } from './store/teamStore';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './lib/utils';
import { HistoryEntry } from './types';
import './App.css';

type Tab = 'status' | 'chat' | 'projects' | 'teams' | 'usage';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, removeToast } = useToastStore();

  const addEntry = useLiveOutputStore((state) => state.addEntry);
  const loadTeam = useTeamStore((state) => state.loadTeam);

  // Load default team configuration on mount
  useEffect(() => {
    loadTeam('default').catch((err) => {
      console.error('Failed to load default team:', err);
    });
  }, [loadTeam]);

  // Listen for navigate-to-chat events from other components
  useEffect(() => {
    const handleNavigateToChat = () => setActiveTab('chat');
    window.addEventListener('navigate-to-chat', handleNavigateToChat);
    return () => window.removeEventListener('navigate-to-chat', handleNavigateToChat);
  }, []);

  // Setup live output streaming
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      // Listen for history entries and route to live output store
      unlisten = await listen<HistoryEntry>('history-entry', (event) => {
        const entry = event.payload;
        console.log('[App] history-entry received:', { tmux_session: entry.tmux_session, entry_type: entry.entry_type, hasMessage: !!entry.message });
        // Only add entries that have a tmux_session (active agent)
        if (entry.tmux_session) {
          addEntry(entry);
        }
      });

      // Start the history stream (watches JSONL files)
      await invoke('start_history_stream').catch((err) => {
        console.error('Failed to start history stream:', err);
      });

      // Load recent history for active sessions (last hour)
      // Small delay to let agent status populate first
      setTimeout(async () => {
        try {
          const status = await invoke<{ core: { session: string }[]; spawned: { session: string }[] }>('get_agent_status');
          const sessions = [
            ...status.core.map(a => a.session),
            ...status.spawned.map(a => a.session),
          ];
          console.log('[App] Loading history for sessions:', sessions);
          if (sessions.length > 0) {
            await invoke('load_history_for_active_sessions', {
              activeSessions: sessions,
              hours: 1,
            });
            console.log('[App] History load complete');
          }
        } catch (err) {
          console.error('Failed to load history for active sessions:', err);
        }
      }, 500);
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [addEntry]);

  const tabs = [
    { id: 'status' as Tab, label: 'Dashboard', tooltip: 'Dashboard', icon: Home },
    { id: 'chat' as Tab, label: 'Chat', tooltip: 'Agents', icon: MessageCircle },
    { id: 'projects' as Tab, label: 'Projects', tooltip: 'Projects', icon: FolderOpen },
    { id: 'teams' as Tab, label: 'Teams', tooltip: 'Teams', icon: Users },
    { id: 'usage' as Tab, label: 'Usage', tooltip: 'Usage', icon: DollarSign },
  ];

  return (
    <AppErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="nolan-ui-theme">
        <QueryClientProvider client={queryClient}>
        {/* Gradient background */}
        <div className="h-screen bg-background relative overflow-hidden">

          {/* Main container */}
          <div className="relative z-10 flex flex-col h-full p-4 gap-4">
            {/* Brand Header - blended into background */}
            <BrandHeader />

            {/* Main layout with sidenav and content */}
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Bubble sidenav */}
              <aside className="flex flex-col items-center justify-between py-4 px-2 bg-card/50 backdrop-blur-xl rounded-2xl border border-border shadow-xl relative z-[100]">
                <nav className="flex flex-col items-center gap-3">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                      <Tooltip key={tab.id} content={tab.tooltip} side="right">
                        <button
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                            isActive
                              ? "bg-foreground/10 text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                      </Tooltip>
                    );
                  })}
                </nav>

                {/* Theme toggle at bottom */}
                <ThemeToggle />
              </aside>

              {/* Main content */}
              <main className={cn(
                "flex-1 overflow-hidden",
                activeTab !== 'chat' && 'overflow-auto pt-0 px-6 pb-6'
              )}>
                {activeTab === 'status' && <StatusPanel />}
                {activeTab === 'chat' && <ChatView />}
                {activeTab === 'projects' && <ProjectsPanel />}
                {activeTab === 'teams' && <TeamsPanel />}
                {activeTab === 'usage' && <UsagePanel />}
              </main>
            </div>
          </div>

          {/* Toast notifications */}
          <ToastContainer toasts={toasts.map(toast => ({ ...toast, onClose: removeToast }))} />

          {/* Terminal modal */}
          <TerminalModal />
        </div>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
