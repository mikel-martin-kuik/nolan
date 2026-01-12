/**
 * Department Store - UI-only state
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (see hooks/useDepartments.ts)
 * - Zustand: UI-only state (THIS - collapsed departments, collapsed pillars)
 *
 * MIGRATION NOTE: Components should migrate to:
 * - useDepartments() hook for departments and teamInfos (server state)
 * - This store for collapsed state and helper functions
 * - Legacy server state is kept for backward compatibility
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@/lib/api';
import type { DepartmentsConfig, DepartmentGroup, TeamInfo, PillarGroup } from '../types';

interface DepartmentState {
  // UI state (persisted to localStorage) - PRIMARY PURPOSE
  collapsedDepartments: string[];
  collapsedPillars: string[];

  // Legacy server state (deprecated - use React Query hooks instead)
  departments: DepartmentsConfig | null;
  teamInfos: TeamInfo[];

  // UI Actions
  toggleDepartmentCollapsed: (departmentName: string) => void;
  setDepartmentCollapsed: (departmentName: string, collapsed: boolean) => void;
  togglePillarCollapsed: (pillarId: string) => void;

  // Legacy actions (deprecated - use React Query hooks instead)
  loadDepartments: () => Promise<void>;
  loadTeamInfos: () => Promise<void>;
  saveDepartments: (config: DepartmentsConfig) => Promise<void>;

  // Pure helper functions (these work with any data source)
  getGroupedTeams: (availableTeams: string[], departments?: DepartmentsConfig | null) => DepartmentGroup[];
  getGroupedByPillar: (teamInfos?: TeamInfo[]) => PillarGroup[];
}

export const useDepartmentStore = create<DepartmentState>()(
  persist(
    (set, get) => ({
      // UI state - PRIMARY
      collapsedDepartments: [],
      collapsedPillars: [],

      // Legacy server state
      departments: null,
      teamInfos: [],

      // UI Actions
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

      togglePillarCollapsed: (pillarId: string) => {
        set((state) => ({
          collapsedPillars: state.collapsedPillars.includes(pillarId)
            ? state.collapsedPillars.filter(p => p !== pillarId)
            : [...state.collapsedPillars, pillarId],
        }));
      },

      // Legacy actions - kept for backward compatibility
      loadDepartments: async () => {
        try {
          const config = await invoke<DepartmentsConfig>('get_departments_config');
          set({ departments: config });
        } catch (error) {
          console.error('Failed to load departments:', error);
          set({ departments: { departments: [] } });
        }
      },

      loadTeamInfos: async () => {
        try {
          const infos = await invoke<TeamInfo[]>('list_teams_info');
          set({ teamInfos: infos });
        } catch (error) {
          console.error('Failed to load team infos:', error);
          set({ teamInfos: [] });
        }
      },

      saveDepartments: async (config: DepartmentsConfig) => {
        await invoke('save_departments_config', { config });
        set({ departments: config });
      },

      // Pure helper - accepts data from any source (store or React Query)
      getGroupedTeams: (availableTeams: string[], departmentsParam?: DepartmentsConfig | null): DepartmentGroup[] => {
        // Use provided departments or fall back to store state
        const departments = departmentsParam !== undefined ? departmentsParam : get().departments;

        if (!departments || departments.departments.length === 0) {
          // No departments configured - all teams in "Other"
          return [{
            name: 'Other',
            teams: availableTeams.sort(),
            isOther: true,
          }];
        }

        // Track which teams have been assigned to a department
        const assignedTeams = new Set<string>();

        // Build department groups (order is preserved from YAML array order)
        const groups: DepartmentGroup[] = departments.departments
          .map(dept => {
            // Filter to only include teams that actually exist
            const existingTeams = (dept.teams || []).filter(t => {
              if (availableTeams.includes(t)) {
                assignedTeams.add(t);
                return true;
              }
              return false;
            });

            return {
              name: dept.name,
              code: dept.code,
              directory: dept.directory,
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
            teams: unassignedTeams.sort(),
            isOther: true,
          });
        }

        return groups;
      },

      // Pure helper - accepts data from any source (store or React Query)
      getGroupedByPillar: (teamInfosParam?: TeamInfo[]): PillarGroup[] => {
        // Use provided teamInfos or fall back to store state
        const teamInfos = teamInfosParam !== undefined ? teamInfosParam : get().teamInfos;

        if (teamInfos.length === 0) {
          return [];
        }

        // Define pillar order and display names
        const pillarOrder = [
          { id: 'organizational-intelligence', name: 'Organizational Intelligence', group: 'pillar_1' },
          { id: 'autonomous-operations', name: 'Autonomous Operations', group: 'pillar_2' },
          { id: 'human-ai-collaboration', name: 'Human-AI Collaboration', group: 'pillar_3' },
          { id: 'foundation', name: 'Foundation', group: 'foundation' },
          { id: 'support', name: 'Support', group: 'support' },
        ];

        const groups: PillarGroup[] = [];
        const assignedTeams = new Set<string>();

        // Group teams by pillar/group
        for (const pillar of pillarOrder) {
          const pillarTeams = teamInfos.filter(t =>
            t.group === pillar.group || t.pillar === pillar.id
          );

          if (pillarTeams.length > 0) {
            pillarTeams.forEach(t => assignedTeams.add(t.id));

            // Create department groups within pillar
            const deptGroups: DepartmentGroup[] = [{
              name: pillar.name,
              teams: pillarTeams.map(t => t.id),
              isOther: false,
            }];

            groups.push({
              id: pillar.id,
              name: pillar.name,
              departments: deptGroups,
              isOther: false,
            });
          }
        }

        // Add root-level teams (like "default") as "Teams" group
        const rootTeams = teamInfos.filter(t => !assignedTeams.has(t.id));
        if (rootTeams.length > 0) {
          groups.unshift({
            id: 'root',
            name: 'Teams',
            departments: [{
              name: 'Teams',
              teams: rootTeams.map(t => t.id),
              isOther: true,
            }],
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
        collapsedPillars: state.collapsedPillars,
      }),
    }
  )
);
