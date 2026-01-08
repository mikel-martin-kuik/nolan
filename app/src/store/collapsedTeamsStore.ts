import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CollapsedTeamsState {
  collapsedTeams: string[];
  setCollapsed: (teamName: string, collapsed: boolean) => void;
  toggleCollapsed: (teamName: string) => void;
}

export const useCollapsedTeamsStore = create<CollapsedTeamsState>()(
  persist(
    (set) => ({
      collapsedTeams: [],
      setCollapsed: (teamName, collapsed) =>
        set((state) => ({
          collapsedTeams: collapsed
            ? [...new Set([...state.collapsedTeams, teamName])]
            : state.collapsedTeams.filter((t) => t !== teamName),
        })),
      toggleCollapsed: (teamName) =>
        set((state) => ({
          collapsedTeams: state.collapsedTeams.includes(teamName)
            ? state.collapsedTeams.filter((t) => t !== teamName)
            : [...state.collapsedTeams, teamName],
        })),
    }),
    {
      name: 'nolan-collapsed-teams',
    }
  )
);
