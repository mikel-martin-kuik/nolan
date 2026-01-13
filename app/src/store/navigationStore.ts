import { create } from 'zustand';

export type Tab = 'status' | 'chat' | 'projects' | 'files' | 'teams' | 'cronos' | 'workflows' | 'usage' | 'support' | 'settings';

export interface NavigationContext {
  // For projects tab: project name to select
  projectName?: string;
  // For cronos tab: agent name to select
  cronAgentName?: string;
  // For files tab: path to navigate to
  filePath?: string;
}

interface NavigationStore {
  // Current tab (managed by App.tsx, but can be read by other components)
  activeTab: Tab;
  // Context for deep-linking
  context: NavigationContext;
  // Navigate to a tab with optional context
  navigateTo: (tab: Tab, context?: NavigationContext) => void;
  // Clear context after it's been consumed
  clearContext: () => void;
  // Set active tab (called by App.tsx to sync state)
  setActiveTab: (tab: Tab) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeTab: 'status',
  context: {},

  navigateTo: (tab, context = {}) => {
    set({ activeTab: tab, context });
  },

  clearContext: () => {
    set({ context: {} });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },
}));
