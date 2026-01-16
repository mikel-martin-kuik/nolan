import { create } from 'zustand';

export type Tab = 'status' | 'chat' | 'files' | 'agents' | 'schedules' | 'workflows' | 'usage' | 'support' | 'settings' | 'builder';
export type BuilderSubTab = 'pipelines' | 'teams' | 'agent-roles' | 'triggers';
export type FileBrowserSubTab = 'files' | 'repos';

export interface NavigationContext {
  // For agents tab: agent name to select
  agentName?: string;
  // For files tab: path to navigate to
  filePath?: string;
  // For builder tab: team to edit
  teamId?: string;
  // For builder tab: phase to edit
  phaseId?: string;
  // For builder tab: pipeline definition to edit
  pipelineId?: string;
}

interface NavigationStore {
  // Current tab (managed by App.tsx, but can be read by other components)
  activeTab: Tab;
  // Builder sub-tab for deep-linking
  builderSubTab: BuilderSubTab;
  // File browser sub-tab for deep-linking
  fileBrowserSubTab: FileBrowserSubTab;
  // Context for deep-linking
  context: NavigationContext;
  // Navigate to a tab with optional context
  navigateTo: (tab: Tab, context?: NavigationContext) => void;
  // Navigate to builder with specific sub-tab
  navigateToBuilder: (subTab: BuilderSubTab, context?: NavigationContext) => void;
  // Set builder sub-tab
  setBuilderSubTab: (subTab: BuilderSubTab) => void;
  // Set file browser sub-tab
  setFileBrowserSubTab: (subTab: FileBrowserSubTab) => void;
  // Clear context after it's been consumed
  clearContext: () => void;
  // Set active tab (called by App.tsx to sync state)
  setActiveTab: (tab: Tab) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeTab: 'status',
  builderSubTab: 'pipelines',
  fileBrowserSubTab: 'files',
  context: {},

  navigateTo: (tab, context = {}) => {
    set({ activeTab: tab, context });
  },

  navigateToBuilder: (subTab, context = {}) => {
    set({ activeTab: 'builder', builderSubTab: subTab, context });
  },

  setBuilderSubTab: (subTab) => {
    set({ builderSubTab: subTab });
  },

  setFileBrowserSubTab: (subTab) => {
    set({ fileBrowserSubTab: subTab });
  },

  clearContext: () => {
    set({ context: {} });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },
}));
