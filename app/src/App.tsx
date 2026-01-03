import { useState } from 'react';
import { Activity, Settings, MessageSquare, ScrollText, Database } from 'lucide-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { StatusPanel } from './components/Status/StatusPanel';
import { LifecyclePanel } from './components/Lifecycle/LifecyclePanel';
import { CommunicatorPanel } from './components/Communicator/CommunicatorPanel';
import { HistoryPanel } from './components/History/HistoryPanel';
import { SessionBrowser } from './components/Sessions/SessionBrowser';
import { ToastContainer } from './components/shared/Toast';
import { useToastStore } from './store/toastStore';
import './App.css';

type Tab = 'status' | 'lifecycle' | 'communicator' | 'history' | 'sessions';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, removeToast } = useToastStore();

  const tabs = [
    { id: 'status' as Tab, label: 'Dashboard', icon: Activity },
    { id: 'lifecycle' as Tab, label: 'Lifecycle', icon: Settings },
    { id: 'communicator' as Tab, label: 'Communicator', icon: MessageSquare },
    { id: 'history' as Tab, label: 'History', icon: ScrollText },
    { id: 'sessions' as Tab, label: 'Sessions', icon: Database },
  ];

  return (
    <QueryClientProvider client={queryClient}>
    <div className="min-h-screen bg-gray-900">
      {/* Header with branding */}
      <div className="bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/10 p-2 rounded-lg">
                <Activity className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Nolan</h1>
                <p className="text-xs text-gray-400">Control Panel</p>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Press <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300">Ctrl+Q</kbd> to quit
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex space-x-1 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 font-medium text-sm
                    transition-all duration-200 border-b-2
                    ${isActive
                      ? 'text-blue-400 border-blue-400 bg-gray-900/50'
                      : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-900/30'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="h-[calc(100vh-121px)]">
        {activeTab === 'status' && <StatusPanel />}
        {activeTab === 'lifecycle' && <LifecyclePanel />}
        {activeTab === 'communicator' && <CommunicatorPanel />}
        {activeTab === 'history' && <HistoryPanel />}
        {activeTab === 'sessions' && <SessionBrowser />}
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts.map(toast => ({ ...toast, onClose: removeToast }))} />
    </div>
    </QueryClientProvider>
  );
}

export default App;
