/**
 * TeamContext - Cross-cutting domain state for active team/project context
 *
 * Part of the layered state management architecture:
 * - React Query: Server state (teams, agents, departments)
 * - Zustand: UI-only state (collapsed panels, etc.)
 * - Context: Cross-cutting domain state (THIS - active project/team context)
 *
 * This context provides:
 * - Current selected team name
 * - Current team configuration (from React Query)
 * - Methods to switch teams
 *
 * Components use this instead of useTeamStore for "currentTeam" access
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useTeamConfig } from '../hooks/useTeams';
import type { TeamConfig } from '../types';

interface TeamContextValue {
  // Current team selection
  currentTeamName: string;
  setCurrentTeamName: (name: string) => void;

  // Team configuration (from React Query)
  currentTeam: TeamConfig | null | undefined;
  isLoadingTeam: boolean;
  teamError: Error | null;
}

const TeamContext = createContext<TeamContextValue | null>(null);

interface TeamProviderProps {
  children: ReactNode;
  defaultTeam?: string;
}

/**
 * Provider component for team context
 *
 * @param defaultTeam - Initial team to load (defaults to 'default')
 */
export function TeamProvider({ children, defaultTeam = 'default' }: TeamProviderProps) {
  const [currentTeamName, setCurrentTeamName] = useState(defaultTeam);

  // Fetch team config using React Query
  const { data: currentTeam, isLoading: isLoadingTeam, error } = useTeamConfig(currentTeamName);

  const value = useMemo<TeamContextValue>(() => ({
    currentTeamName,
    setCurrentTeamName,
    currentTeam,
    isLoadingTeam,
    teamError: error as Error | null,
  }), [currentTeamName, currentTeam, isLoadingTeam, error]);

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}

/**
 * Hook to access team context
 *
 * Must be used within a TeamProvider
 */
export function useTeamContext(): TeamContextValue {
  const context = useContext(TeamContext);

  if (!context) {
    throw new Error('useTeamContext must be used within a TeamProvider');
  }

  return context;
}

/**
 * Hook for accessing just the current team config
 * Convenient shorthand for components that only need the team config
 */
export function useCurrentTeam(): TeamConfig | null | undefined {
  const { currentTeam } = useTeamContext();
  return currentTeam;
}

/**
 * Hook for team switching functionality
 */
export function useTeamSelection() {
  const { currentTeamName, setCurrentTeamName, isLoadingTeam } = useTeamContext();

  const selectTeam = useCallback((teamName: string) => {
    setCurrentTeamName(teamName);
  }, [setCurrentTeamName]);

  return {
    currentTeamName,
    selectTeam,
    isLoading: isLoadingTeam,
  };
}
