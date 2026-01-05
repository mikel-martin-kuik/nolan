import { useState } from 'react';
import { Home, MessageSquare, FolderOpen } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './lib/theme';
import { AppErrorBoundary } from './components/shared/AppErrorBoundary';
import { StatusPanel } from './components/Status/StatusPanel';
import { HistoryCommunicatorPanel } from './components/HistoryCommunicator/HistoryCommunicatorPanel';
import { ProjectsPanel } from './components/Projects/ProjectsPanel';
import { ToastContainer } from './components/shared/Toast';
import { BrandHeader } from './components/shared/BrandHeader';
import { ThemeToggle } from './components/shared/ThemeToggle';
import { useToastStore } from './store/toastStore';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './lib/utils';
import './App.css';

type Tab = 'status' | 'history-communicator' | 'projects';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, removeToast } = useToastStore();

  const tabs = [
    { id: 'status' as Tab, label: 'Dashboard', tooltip: 'Dashboard', icon: Home },
    { id: 'history-communicator' as Tab, label: 'History & Communicator', tooltip: 'History', icon: MessageSquare },
    { id: 'projects' as Tab, label: 'Projects', tooltip: 'Projects', icon: FolderOpen },
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
                              ? "bg-primary/20 text-primary shadow-lg shadow-primary/20"
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
              <main className="flex-1 overflow-auto p-6">
                {activeTab === 'status' && <StatusPanel />}
                {activeTab === 'history-communicator' && <HistoryCommunicatorPanel />}
                {activeTab === 'projects' && <ProjectsPanel />}
              </main>
            </div>
          </div>

          {/* Toast notifications */}
          <ToastContainer toasts={toasts.map(toast => ({ ...toast, onClose: removeToast }))} />
        </div>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
