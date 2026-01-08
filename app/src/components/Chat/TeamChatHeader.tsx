import React from 'react';
import { Users, ChevronLeft, ChevronDown, Filter, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TeamChatState } from '../../hooks/useTeamMessages';
import { useAgentStore } from '../../store/agentStore';
import { getAgentDisplayNameForUI, parseRalphSession } from '../../lib/agentIdentity';
import type { AgentStatus } from '../../types';

interface TeamChatHeaderProps {
  teamState: TeamChatState;
  agentFilter: string | null;
  onAgentFilterChange: (agent: string | null) => void;
  onBackClick: () => void;
}

function getAgentDisplayName(agent: AgentStatus): string {
  const ralphName = agent.name === 'ralph' ? parseRalphSession(agent.session) : undefined;
  return getAgentDisplayNameForUI(agent.name, ralphName);
}

export const TeamChatHeader: React.FC<TeamChatHeaderProps> = ({
  teamState,
  agentFilter,
  onAgentFilterChange,
  onBackClick,
}) => {
  const { teamAgents } = useAgentStore();
  const [showDropdown, setShowDropdown] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Get team members
  const teamMembers = teamAgents.filter((a) => a.team === teamState.teamName);

  // Get current filter agent name for display
  const filterAgentName = agentFilter
    ? teamMembers.find((a) => a.session === agentFilter)
    : null;

  const displayFilterName = filterAgentName
    ? getAgentDisplayName(filterAgentName)
    : 'All members';

  // Format team name for display
  const displayTeamName =
    teamState.teamName.charAt(0).toUpperCase() + teamState.teamName.slice(1);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div className="px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Back button - visible on mobile */}
          <button
            onClick={onBackClick}
            className="md:hidden p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Back to teams"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Team avatar */}
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              teamState.isAnyAgentWorking ? 'bg-primary/20' : 'bg-muted'
            )}
          >
            <Users
              className={cn(
                'w-5 h-5',
                teamState.isAnyAgentWorking ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div>
            <h3 className="font-medium flex items-center gap-2">
              {displayTeamName}
              {teamState.isAnyAgentWorking && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {teamState.activeAgentCount} of {teamState.totalAgentCount} active
            </p>
          </div>
        </div>

        {/* Agent filter dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors',
              agentFilter
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{displayFilterName}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
              {/* All members option */}
              <button
                onClick={() => {
                  onAgentFilterChange(null);
                  setShowDropdown(false);
                }}
                className={cn(
                  'w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left',
                  !agentFilter && 'text-primary font-medium'
                )}
              >
                <Users className="w-4 h-4" />
                All members
                {!agentFilter && <span className="ml-auto text-xs">*</span>}
              </button>

              <div className="border-t border-border my-1" />

              {/* Individual agents */}
              {teamMembers.map((agent) => {
                const displayName = getAgentDisplayName(agent);
                const isSelected = agentFilter === agent.session;

                return (
                  <button
                    key={agent.session}
                    onClick={() => {
                      onAgentFilterChange(agent.session);
                      setShowDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors text-left',
                      isSelected && 'text-primary font-medium'
                    )}
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        agent.active ? 'bg-green-500' : 'bg-muted-foreground/40'
                      )}
                    />
                    {displayName}
                    {isSelected && <span className="ml-auto text-xs">*</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Clear filter button (when filter is active) */}
          {agentFilter && (
            <button
              onClick={() => onAgentFilterChange(null)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 transition-colors"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
