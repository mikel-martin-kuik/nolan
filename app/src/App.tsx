import { useState, useEffect } from 'react';
import { Home, FolderOpen, DollarSign, MessageCircle, Users, FileUser, Settings, Lightbulb, GitBranch } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@/lib/events';
import { invoke, isBrowserMode } from '@/lib/api';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './lib/theme';
import { TeamProvider } from './contexts';
import { AppErrorBoundary } from './components/shared/AppErrorBoundary';
import { StatusPanel } from './components/Status/StatusPanel';
import { ProjectsPanel } from './components/Projects/ProjectsPanel';
import { UsageAndMetricsPanel } from './components/Usage';
import { TeamsPanel } from './components/Teams';
import { ChatView } from './components/Chat';
import { CronosPanel } from './components/Cronos';
import { WorkflowVisualizerPanel } from './components/Workflow';
import { SupportPanel } from './components/Support';
import { ToastContainer } from './components/shared/Toast';
import { TerminalModal } from './components/Terminal/TerminalModal';
import { BrandHeader } from './components/shared/BrandHeader';
import { ThemeToggle } from './components/shared/ThemeToggle';
import { PasswordPrompt } from './components/Settings/PasswordPrompt';
import { ServerSelector } from './components/Settings/ServerSelector';
import { AuthStatus } from './components/Settings/AuthStatus';
import { OllamaSettings } from './components/Settings/OllamaSettings';
import { useAuth } from './hooks/useAuth';
import { useToastStore } from './store/toastStore';
import { useLiveOutputStore } from './store/liveOutputStore';
import { useTeamStore } from './store/teamStore';
import { useNavigationStore } from './store/navigationStore';
import { useSessionLabelsStore, initSessionLabelsListener, cleanupSessionLabelsListener } from './store/sessionLabelsStore';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './lib/utils';
import { HistoryEntry } from './types';
import './App.css';

type Tab = 'status' | 'chat' | 'projects' | 'teams' | 'cronos' | 'workflows' | 'usage' | 'support' | 'settings';

function App() {
  const [activeTab, setActiveTabLocal] = useState<Tab>('status');
  const { toasts, removeToast } = useToastStore();
  const { status: authStatus, loading: authLoading, login, logout, setupPassword } = useAuth();
  const { activeTab: navStoreTab, setActiveTab: setNavStoreTab } = useNavigationStore();

  const addEntry = useLiveOutputStore((state) => state.addEntry);
  const loadTeam = useTeamStore((state) => state.loadTeam);
  const fetchSessionLabels = useSessionLabelsStore((state) => state.fetchLabels);

  // Sync local state with navigation store
  const setActiveTab = (tab: Tab) => {
    setActiveTabLocal(tab);
    setNavStoreTab(tab);
  };

  // Subscribe to navigation store changes
  useEffect(() => {
    if (navStoreTab !== activeTab) {
      setActiveTabLocal(navStoreTab);
    }
  }, [navStoreTab]);

  // Check if we need to show auth prompt (browser mode only)
  const needsAuth = isBrowserMode() && authStatus?.authRequired && !authStatus?.authenticated;
  const needsSetup = isBrowserMode() && authStatus?.authRequired && !authStatus?.passwordConfigured;

  // Load default team configuration on mount
  useEffect(() => {
    loadTeam('default').catch((err) => {
      console.error('Failed to load default team:', err);
    });
  }, [loadTeam]);

  // Initialize session labels (for Ralph custom naming)
  useEffect(() => {
    fetchSessionLabels();
    initSessionLabelsListener();
    return () => cleanupSessionLabelsListener();
  }, [fetchSessionLabels]);

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
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let cachedSessions: string[] = []; // Cache sessions for polling

    // Function to load history for active sessions
    const loadHistory = async (isPolling = false) => {
      try {
        let sessions: string[] = [];

        // For polling, try to use cached sessions first to avoid auth issues
        if (isPolling && cachedSessions.length > 0) {
          sessions = cachedSessions;
        } else {
          // Fetch fresh session list
          const status = await invoke<{ team: { session: string }[]; free: { session: string }[] }>('get_agent_status');
          sessions = [
            ...status.team.map(a => a.session),
            ...status.free.map(a => a.session),
          ];
          // Cache for future polling
          if (sessions.length > 0) {
            cachedSessions = sessions;
          }
        }

        if (sessions.length > 0) {
          // In browser mode, the API returns entries directly (no events)
          // For polling, use 1 hour - deduplication in store handles overlap
          const historyHours = isPolling ? 1 : (isBrowserMode() ? 24 : 1);
          if (isBrowserMode()) {
            const entries = await invoke<HistoryEntry[]>('load_history_for_active_sessions', {
              activeSessions: sessions,
              hours: historyHours,
            });
            // Add entries that have a tmux_session
            if (!isPolling) {
              console.log(`[browser] Loaded ${entries.length} history entries for ${sessions.length} sessions`);
            }
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
        if (!isPolling) {
          console.error('Failed to load history for active sessions:', err);
        }
        // For polling, if we have cached sessions, try to use them anyway
        if (isPolling && cachedSessions.length > 0 && isBrowserMode()) {
          try {
            const entries = await invoke<HistoryEntry[]>('load_history_for_active_sessions', {
              activeSessions: cachedSessions,
              hours: 1,
            });
            entries.forEach(entry => {
              if (entry.tmux_session) {
                addEntry(entry);
              }
            });
          } catch {
            // Silently fail - will retry on next poll
          }
        }
      }
    };

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
      timeoutId = setTimeout(() => loadHistory(false), 500);

      // In browser mode, poll for new history entries since we don't have real-time events
      if (isBrowserMode()) {
        pollIntervalId = setInterval(() => loadHistory(true), 3000); // Poll every 3 seconds
      }
    };

    setup().catch((err) => {
      console.error('Failed to setup live output streaming:', err);
    });

    return () => {
      if (unlisten) unlisten();
      if (timeoutId) clearTimeout(timeoutId);
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  }, [addEntry]);

  const tabs = [
    { id: 'status' as Tab, label: 'Dashboard', tooltip: 'Dashboard', icon: Home },
    { id: 'chat' as Tab, label: 'Chat', tooltip: 'Chat', icon: MessageCircle },
    { id: 'projects' as Tab, label: 'Projects', tooltip: 'Projects', icon: FolderOpen },
    { id: 'teams' as Tab, label: 'Teams', tooltip: 'Teams', icon: Users },
    { id: 'cronos' as Tab, label: 'Agents', tooltip: 'Agents', icon: FileUser },
    { id: 'workflows' as Tab, label: 'Workflows', tooltip: 'Workflows', icon: GitBranch },
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
        <TeamProvider defaultTeam="default">
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

                {/* Support, Settings and theme toggle at bottom */}
                <div className="flex flex-col items-center gap-3">
                  <Tooltip content="Feedback & Ideas" side="right">
                    <button
                      onClick={() => setActiveTab('support')}
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                        activeTab === 'support'
                          ? "bg-foreground/10 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Lightbulb className="w-5 h-5" />
                    </button>
                  </Tooltip>
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
                {activeTab === 'cronos' && <CronosPanel />}
                {activeTab === 'workflows' && <WorkflowVisualizerPanel />}
                {activeTab === 'usage' && <UsageAndMetricsPanel />}
                {activeTab === 'support' && <SupportPanel />}
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
                    <OllamaSettings />
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
        </TeamProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
