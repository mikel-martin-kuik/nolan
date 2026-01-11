import React, { useState, useEffect } from 'react';
import { invoke } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2 } from 'lucide-react';

interface TeamLaunchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (teamName: string) => void;
  projectName: string;
  isLaunching?: boolean;
}

export const TeamLaunchModal: React.FC<TeamLaunchModalProps> = ({
  open,
  onOpenChange,
  onLaunch,
  projectName,
  isLaunching = false,
}) => {
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Load teams when modal opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      invoke<string[]>('list_teams')
        .then((teamList) => {
          setTeams(teamList);
          // Pre-select first team or 'default' if available
          if (teamList.includes('default')) {
            setSelectedTeam('default');
          } else if (teamList.length > 0) {
            setSelectedTeam(teamList[0]);
          }
        })
        .catch((err) => {
          console.error('Failed to load teams:', err);
          setTeams([]);
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedTeam('');
    }
  }, [open]);

  const handleLaunch = () => {
    if (selectedTeam) {
      onLaunch(selectedTeam);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Launch Team
          </AlertDialogTitle>
          <AlertDialogDescription>
            Project <span className="font-medium text-foreground">{projectName}</span> has been created.
            Select a team to start working on it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a team..." />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team} value={team}>
                    {team}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLaunching}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLaunch}
            disabled={!selectedTeam || isLaunching}
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Launching...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Launch
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
