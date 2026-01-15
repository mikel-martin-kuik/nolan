/**
 * TeamList.tsx
 *
 * Team list sidebar component with pillar/department grouping.
 * Extracted from TeamsPanel.tsx for AI-friendly file sizes.
 *
 * See docs/AI_ARCHITECTURE.md for guidelines.
 */

import React from 'react';
import { cn } from '../../lib/utils';
import { FileText, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DepartmentGroup, PillarGroup } from '@/types';

interface TeamListProps {
  // Data
  availableTeams: string[];
  selectedTeam: string | null;
  departmentGroups: DepartmentGroup[];
  pillarGroups: PillarGroup[];
  showPillarView: boolean;
  collapsedDepartments: string[];
  collapsedPillars: string[];
  showMobileDetails: boolean;

  // Actions
  onSelectTeam: (teamName: string) => void;
  onContextMenu: (e: React.MouseEvent, teamName: string) => void;
  toggleDepartmentCollapsed: (name: string) => void;
  togglePillarCollapsed: (id: string) => void;
}

export const TeamList: React.FC<TeamListProps> = ({
  availableTeams,
  selectedTeam,
  departmentGroups,
  pillarGroups,
  showPillarView,
  collapsedDepartments,
  collapsedPillars,
  showMobileDetails,
  onSelectTeam,
  onContextMenu,
  toggleDepartmentCollapsed,
  togglePillarCollapsed,
}) => {
  // Team item component
  const TeamItem: React.FC<{ teamName: string }> = ({ teamName }) => (
    <button
      onClick={() => onSelectTeam(teamName)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, teamName);
      }}
      className={cn(
        "w-full text-left p-2.5 rounded-lg transition-colors flex items-center gap-2",
        selectedTeam === teamName
          ? 'bg-primary/10 border border-primary/30 text-foreground'
          : 'bg-secondary/30 border border-border hover:bg-secondary/50 text-foreground'
      )}
    >
      <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="font-medium text-sm truncate">{teamName}</span>
      {teamName === 'default' && (
        <Badge variant="secondary" className="ml-auto text-[10px]">
          Default
        </Badge>
      )}
      {selectedTeam === teamName && (
        <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
      )}
    </button>
  );

  return (
    <div className={cn(
      "flex flex-col bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden",
      // Desktop: fixed width sidebar
      "md:w-[320px] md:flex-shrink-0",
      // Mobile: full width, hide when viewing details
      "w-full",
      showMobileDetails && "hidden md:flex"
    )}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Available Teams ({availableTeams.length})
        </h2>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-4 space-y-3">
        {showPillarView ? (
          // Hierarchical pillar view
          pillarGroups.map((pillar) => {
            const isPillarCollapsed = collapsedPillars.includes(pillar.id);

            return (
              <div key={pillar.id} className="mb-2">
                {/* Pillar Header */}
                {!pillar.isOther && (
                  <button
                    onClick={() => togglePillarCollapsed(pillar.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-secondary/30 rounded-lg transition-colors border-l-2 border-primary/50"
                  >
                    {isPillarCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-primary" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-primary" />
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {pillar.name}
                    </span>
                    <span className="text-xs text-muted-foreground/60 ml-auto">
                      {pillar.departments.reduce((sum, d) => sum + d.teams.length, 0)}
                    </span>
                  </button>
                )}

                {/* Teams within pillar */}
                {(!isPillarCollapsed || pillar.isOther) && (
                  <div className={pillar.isOther ? '' : 'ml-2 mt-1'}>
                    {pillar.departments.map((dept) => (
                      <div key={dept.name} className="space-y-1">
                        {dept.teams.map((teamName) => (
                          <TeamItem key={teamName} teamName={teamName} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Fallback to flat department view (backward compatible)
          departmentGroups.map((group) => {
            const isCollapsed = collapsedDepartments.includes(group.name);

            return (
              <div key={group.name}>
                {/* Department Header */}
                <button
                  onClick={() => toggleDepartmentCollapsed(group.name)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary/30 rounded-lg transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">
                    {group.teams.length}
                  </span>
                </button>

                {/* Team List (collapsible) */}
                {!isCollapsed && (
                  <div className="mt-1 space-y-1">
                    {group.teams.map((teamName) => (
                      <TeamItem key={teamName} teamName={teamName} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {availableTeams.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No teams found. Create your first team.
          </p>
        )}
      </div>
    </div>
  );
};
