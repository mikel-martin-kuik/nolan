import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CollapsedCronGroupsState {
  collapsedGroups: string[];
  isCollapsed: (groupId: string) => boolean;
  toggleCollapsed: (groupId: string) => void;
}

export const useCollapsedCronGroupsStore = create<CollapsedCronGroupsState>()(
  persist(
    (set, get) => ({
      collapsedGroups: [],
      isCollapsed: (groupId) => get().collapsedGroups.includes(groupId),
      toggleCollapsed: (groupId) =>
        set((state) => ({
          collapsedGroups: state.collapsedGroups.includes(groupId)
            ? state.collapsedGroups.filter((g) => g !== groupId)
            : [...state.collapsedGroups, groupId],
        })),
    }),
    {
      name: 'nolan-collapsed-cron-groups',
    }
  )
);
