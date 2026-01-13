import React, { useEffect, useState } from 'react';
import { useTeamStore } from '@/store/teamStore';
import { useDepartmentStore } from '@/store/departmentStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, FileText, Plus, Settings } from 'lucide-react';

interface TeamSelectorProps {
  onCreateTeam?: () => void;
  onManageDepartments?: () => void;
}

export const TeamSelector: React.FC<TeamSelectorProps> = ({
  onCreateTeam,
  onManageDepartments,
}) => {
  const { availableTeams, loadAvailableTeams, loadTeam, currentTeamName } = useTeamStore();
  const {
    loadDepartments,
    loadTeamInfos,
    getGroupedByPillar,
    collapsedPillars: _collapsedPillars,
  } = useDepartmentStore();

  const [isOpen, setIsOpen] = useState(false);

  // Load teams and departments on mount
  useEffect(() => {
    loadAvailableTeams();
    loadDepartments();
    loadTeamInfos();
  }, [loadAvailableTeams, loadDepartments, loadTeamInfos]);

  // Load default team if not loaded
  useEffect(() => {
    if (availableTeams.length > 0 && !currentTeamName) {
      const defaultTeam = availableTeams.includes('default') ? 'default' : availableTeams[0];
      loadTeam(defaultTeam);
    }
  }, [availableTeams, currentTeamName, loadTeam]);

  const handleSelectTeam = async (teamName: string) => {
    await loadTeam(teamName);
    setIsOpen(false);
  };

  // Get teams grouped by pillar
  const pillarGroups = getGroupedByPillar();
  const showPillarView = pillarGroups.length > 0 && pillarGroups.some(p => !p.isOther);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-between">
          <div className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate capitalize">{currentTeamName || 'Select team'}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px] max-h-[400px] overflow-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Teams ({availableTeams.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {showPillarView ? (
          // Hierarchical pillar view
          pillarGroups.map((pillar) => {
            if (pillar.isOther) {
              // Root-level teams without pillar
              return pillar.departments[0]?.teams.map((teamName) => (
                <DropdownMenuItem
                  key={teamName}
                  onClick={() => handleSelectTeam(teamName)}
                  className="gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate capitalize flex-1">{teamName}</span>
                  {teamName === 'default' && (
                    <Badge variant="secondary" className="text-[10px]">Default</Badge>
                  )}
                  {currentTeamName === teamName && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuItem>
              ));
            }

            // Pillar with teams
            return (
              <DropdownMenuSub key={pillar.id}>
                <DropdownMenuSubTrigger className="gap-2">
                  <span className="text-sm font-medium truncate">{pillar.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {pillar.departments.reduce((sum, d) => sum + d.teams.length, 0)}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[300px] overflow-auto">
                  {pillar.departments.flatMap((dept) =>
                    dept.teams.map((teamName) => (
                      <DropdownMenuItem
                        key={teamName}
                        onClick={() => handleSelectTeam(teamName)}
                        className="gap-2"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate capitalize flex-1">{teamName}</span>
                        {currentTeamName === teamName && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })
        ) : (
          // Flat list of teams
          availableTeams.map((teamName) => (
            <DropdownMenuItem
              key={teamName}
              onClick={() => handleSelectTeam(teamName)}
              className="gap-2"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate capitalize flex-1">{teamName}</span>
              {teamName === 'default' && (
                <Badge variant="secondary" className="text-[10px]">Default</Badge>
              )}
              {currentTeamName === teamName && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </DropdownMenuItem>
          ))
        )}

        {/* Actions */}
        {(onCreateTeam || onManageDepartments) && (
          <>
            <DropdownMenuSeparator />
            {onCreateTeam && (
              <DropdownMenuItem onClick={onCreateTeam} className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                <span>New Team</span>
              </DropdownMenuItem>
            )}
            {onManageDepartments && (
              <DropdownMenuItem onClick={onManageDepartments} className="gap-2">
                <Settings className="h-3.5 w-3.5" />
                <span>Manage Departments</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
