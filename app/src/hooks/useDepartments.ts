/**
 * React Query hooks for department data
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (departments config, team infos)
 * - Zustand: UI-only state (collapsed departments, collapsed pillars)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import type { DepartmentsConfig, TeamInfo } from '../types';

// Query keys for consistent cache management
export const departmentKeys = {
  all: ['departments'] as const,
  config: () => [...departmentKeys.all, 'config'] as const,
  teamInfos: () => [...departmentKeys.all, 'teamInfos'] as const,
};

/**
 * Hook to fetch departments configuration
 */
export function useDepartmentsConfig() {
  return useQuery({
    queryKey: departmentKeys.config(),
    queryFn: async () => {
      try {
        const config = await invoke<DepartmentsConfig>('get_departments_config');
        return config;
      } catch (error) {
        console.error('Failed to load departments:', error);
        return { departments: [] } as DepartmentsConfig;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch team infos (extended team metadata)
 */
export function useTeamInfos() {
  return useQuery({
    queryKey: departmentKeys.teamInfos(),
    queryFn: async () => {
      try {
        const infos = await invoke<TeamInfo[]>('list_teams_info');
        return infos;
      } catch (error) {
        console.error('Failed to load team infos:', error);
        return [] as TeamInfo[];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to save departments configuration
 */
export function useSaveDepartments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: DepartmentsConfig) => {
      await invoke('save_departments_config', { config });
      return config;
    },
    onSuccess: (config) => {
      // Update the cache with the new config
      queryClient.setQueryData(departmentKeys.config(), config);
    },
  });
}

// Result type for useDepartments hook
export interface UseDepartmentsResult {
  departments: DepartmentsConfig | null;
  teamInfos: TeamInfo[];
  isLoading: boolean;
  saveDepartments: (config: DepartmentsConfig) => Promise<void>;
  isSaving: boolean;
}

/**
 * Combined hook for department data - provides backward-compatible interface
 * for components migrating from useDepartmentStore
 */
export function useDepartments(): UseDepartmentsResult {
  const { data: departments = null, isLoading: deptLoading } = useDepartmentsConfig();
  const { data: teamInfos = [], isLoading: infosLoading } = useTeamInfos();
  const saveMutation = useSaveDepartments();

  return {
    departments,
    teamInfos,
    isLoading: deptLoading || infosLoading,
    saveDepartments: async (config: DepartmentsConfig) => {
      await saveMutation.mutateAsync(config);
    },
    isSaving: saveMutation.isPending,
  };
}
