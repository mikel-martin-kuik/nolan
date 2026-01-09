import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@/lib/api';
import type { DepartmentsConfig, DepartmentGroup } from '../types';

interface DepartmentState {
  // Data from backend
  departments: DepartmentsConfig | null;

  // UI state (persisted to localStorage)
  collapsedDepartments: string[];

  // Actions
  loadDepartments: () => Promise<void>;
  saveDepartments: (config: DepartmentsConfig) => Promise<void>;
  toggleDepartmentCollapsed: (departmentName: string) => void;
  setDepartmentCollapsed: (departmentName: string, collapsed: boolean) => void;

  // Computed helper
  getGroupedTeams: (availableTeams: string[]) => DepartmentGroup[];
}

export const useDepartmentStore = create<DepartmentState>()(
  persist(
    (set, get) => ({
      departments: null,
      collapsedDepartments: [],

      loadDepartments: async () => {
        try {
          const config = await invoke<DepartmentsConfig>('get_departments_config');
          set({ departments: config });
        } catch (error) {
          console.error('Failed to load departments:', error);
          set({ departments: { departments: [] } });
        }
      },

      saveDepartments: async (config: DepartmentsConfig) => {
        await invoke('save_departments_config', { config });
        set({ departments: config });
      },

      toggleDepartmentCollapsed: (departmentName: string) => {
        set((state) => ({
          collapsedDepartments: state.collapsedDepartments.includes(departmentName)
            ? state.collapsedDepartments.filter(d => d !== departmentName)
            : [...state.collapsedDepartments, departmentName],
        }));
      },

      setDepartmentCollapsed: (departmentName: string, collapsed: boolean) => {
        set((state) => ({
          collapsedDepartments: collapsed
            ? [...new Set([...state.collapsedDepartments, departmentName])]
            : state.collapsedDepartments.filter(d => d !== departmentName),
        }));
      },

      getGroupedTeams: (availableTeams: string[]): DepartmentGroup[] => {
        const { departments } = get();

        if (!departments || departments.departments.length === 0) {
          // No departments configured - all teams in "Other"
          return [{
            name: 'Other',
            order: 999,
            teams: availableTeams.sort(),
            isOther: true,
          }];
        }

        // Track which teams have been assigned to a department
        const assignedTeams = new Set<string>();

        // Build department groups
        const groups: DepartmentGroup[] = departments.departments
          .sort((a, b) => a.order - b.order)
          .map(dept => {
            // Filter to only include teams that actually exist
            const existingTeams = dept.teams.filter(t => {
              if (availableTeams.includes(t)) {
                assignedTeams.add(t);
                return true;
              }
              return false;
            });

            return {
              name: dept.name,
              order: dept.order,
              teams: existingTeams,
              isOther: false,
            };
          })
          .filter(g => g.teams.length > 0); // Remove empty groups

        // Add "Other" group for unassigned teams
        const unassignedTeams = availableTeams.filter(t => !assignedTeams.has(t));
        if (unassignedTeams.length > 0) {
          groups.push({
            name: 'Other',
            order: 999,
            teams: unassignedTeams.sort(),
            isOther: true,
          });
        }

        return groups;
      },
    }),
    {
      name: 'nolan-departments',
      partialize: (state) => ({
        // Only persist the UI state, not the data from backend
        collapsedDepartments: state.collapsedDepartments,
      }),
    }
  )
);
