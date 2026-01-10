import { useState, useEffect } from 'react';
import { Home, FolderOpen, DollarSign, MessageCircle, Users, FileUser, Clock, Settings } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@/lib/events';
import { invoke, isBrowserMode } from '@/lib/api';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './lib/theme';
import { AppErrorBoundary } from './components/shared/AppErrorBoundary';
import { StatusPanel } from './components/Status/StatusPanel';
import { ProjectsPanel } from './components/Projects/ProjectsPanel';
import { UsagePanel } from './components/Usage/UsagePanel';
import { TeamsPanel } from './components/Teams';
import { ChatView } from './components/Chat';
import { AgentManager } from './components/Agents';
import { CronosPanel } from './components/Cronos';
import { ToastContainer } from './components/shared/Toast';
import { TerminalModal } from './components/Terminal/TerminalModal';
import { BrandHeader } from './components/shared/BrandHeader';
import { ThemeToggle } from './components/shared/ThemeToggle';
import { PasswordPrompt } from './components/Settings/PasswordPrompt';
import { ServerSelector } from './components/Settings/ServerSelector';
import { AuthStatus } from './components/Settings/AuthStatus';
import { useAuth } from './hooks/useAuth';
import { useToastStore } from './store/toastStore';
import { useLiveOutputStore } from './store/liveOutputStore';
import { useTeamStore } from './store/teamStore';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './lib/utils';
import { HistoryEntry } from './types';
import './App.css';

type Tab = 'status' | 'chat' | 'projects' | 'teams' | 'agents' | 'cronos' | 'usage' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, removeToast } = useToastStore();
  const { status: authStatus, loading: authLoading, login, logout, setupPassword } = useAuth();

  const addEntry = useLiveOutputStore((state) => state.addEntry);
  const loadTeam = useTeamStore((state) => state.loadTeam);

  // Check if we need to show auth prompt (browser mode only)
  const needsAuth = isBrowserMode() && authStatus?.authRequired && !authStatus?.authenticated;
  const needsSetup = isBrowserMode() && authStatus?.authRequired && !authStatus?.passwordConfigured;

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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      // Listen for history entries and route to live output store
      unlisten = await listen<HistoryEntry>('history-entry', (event) => {
        const entry = event.payload;
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
      timeoutId = setTimeout(async () => {
        try {
          const status = await invoke<{ team: { session: string }[]; free: { session: string }[] }>('get_agent_status');
          const sessions = [
            ...status.team.map(a => a.session),
            ...status.free.map(a => a.session),
          ];
          if (sessions.length > 0) {
            // In browser mode, the API returns entries directly (no events)
            // Use 24 hours to load more context
            const historyHours = isBrowserMode() ? 24 : 1;
            if (isBrowserMode()) {
              const entries = await invoke<HistoryEntry[]>('load_history_for_active_sessions', {
                activeSessions: sessions,
                hours: historyHours,
              });
              // Add entries that have a tmux_session
              console.log(`[browser] Loaded ${entries.length} history entries for ${sessions.length} sessions`);
              entries.forEach(entry => {
                if (entry.tmux_session) {
                  addEntry(entry);
                }
              });
            } else {
              // In Tauri mode, entries are emitted via events
              await invoke('load_history_for_active_sessions', {
                activeSessions: sessions,
                hours: historyHours,
              });
            }
          }
        } catch (err) {
          console.error('Failed to load history for active sessions:', err);
        }
      }, 500);
    };

    setup();

    return () => {
      if (unlisten) unlisten();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [addEntry]);

  const tabs = [
    { id: 'status' as Tab, label: 'Dashboard', tooltip: 'Dashboard', icon: Home },
    { id: 'chat' as Tab, label: 'Chat', tooltip: 'Chat', icon: MessageCircle },
    { id: 'projects' as Tab, label: 'Projects', tooltip: 'Projects', icon: FolderOpen },
    { id: 'teams' as Tab, label: 'Teams', tooltip: 'Teams', icon: Users },
    { id: 'agents' as Tab, label: 'Agents', tooltip: 'Agents', icon: FileUser },
    { id: 'cronos' as Tab, label: 'Cronos', tooltip: 'Cron Agents', icon: Clock },
    { id: 'usage' as Tab, label: 'Usage', tooltip: 'Usage', icon: DollarSign },
  ];

  // Show loading while checking auth
  if (isBrowserMode() && authLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show password prompt if auth is required
  if (needsAuth || needsSetup) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="nolan-ui-theme">
        <PasswordPrompt
          isSetup={needsSetup}
          onSubmit={needsSetup ? setupPassword : login}
        />
      </ThemeProvider>
    );
  }

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

                {/* Settings and theme toggle at bottom */}
                <div className="flex flex-col items-center gap-3">
                  <Tooltip content="Settings" side="right">
                    <button
                      onClick={() => setActiveTab('settings')}
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                        activeTab === 'settings'
                          ? "bg-foreground/10 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  </Tooltip>
                  <ThemeToggle />
                </div>
              </aside>

              {/* Main content */}
              <main className="flex-1 overflow-hidden overflow-auto px-6 pb-6">
                {activeTab === 'status' && <StatusPanel />}
                {activeTab === 'chat' && <ChatView />}
                {activeTab === 'projects' && <ProjectsPanel />}
                {activeTab === 'teams' && <TeamsPanel />}
                {activeTab === 'agents' && <AgentManager />}
                {activeTab === 'cronos' && <CronosPanel />}
                {activeTab === 'usage' && <UsagePanel />}
                {activeTab === 'settings' && (
                  <div className="max-w-2xl space-y-6">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <ServerSelector
                      currentUrl={localStorage.getItem('nolan-server-url') || 'http://localhost:3030'}
                      onConnect={() => {
                        window.location.reload();
                      }}
                    />
                    {authStatus && (
                      <AuthStatus
                        authenticated={authStatus.authenticated}
                        authRequired={authStatus.authRequired}
                        onLogout={logout}
                      />
                    )}
                  </div>
                )}
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
