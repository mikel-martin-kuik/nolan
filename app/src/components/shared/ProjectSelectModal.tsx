import React, { useState, useEffect, useMemo } from 'react';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { ProjectInfo } from '@/types/projects';
import { FolderOpen, Plus, Rocket, FileText, MessageSquare, FileCheck } from 'lucide-react';

export interface LaunchParams {
  projectName: string;
  isNew: boolean;
  // For new projects: the initial prompt (written to prompt.md)
  initialPrompt?: string;
  // For existing projects: updated original prompt (only if modified)
  updatedOriginalPrompt?: string;
  // For existing projects: followup prompt to send to Dan
  followupPrompt?: string;
}

interface ProjectSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (params: LaunchParams) => void;
  projects: ProjectInfo[];
  isLoading?: boolean;
  teamName?: string;  // Team being launched - filters projects to only show team's projects
}

type Mode = 'existing' | 'new';

export const ProjectSelectModal: React.FC<ProjectSelectModalProps> = ({
  open,
  onOpenChange,
  onLaunch,
  projects,
  isLoading = false,
  teamName,
}) => {
  // Filter projects to only show those belonging to this team
  // Memoized to prevent unnecessary re-renders and effect triggers
  const teamProjects = useMemo(
    () => (teamName ? projects.filter(p => p.team === teamName) : projects),
    [projects, teamName]
  );
  const [mode, setMode] = useState<Mode>('existing');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  // For new projects: the initial prompt
  const [newProjectPrompt, setNewProjectPrompt] = useState<string>('');
  // For existing projects: original prompt from prompt.md
  const [originalPrompt, setOriginalPrompt] = useState<string>('');
  const [savedOriginalPrompt, setSavedOriginalPrompt] = useState<string>(''); // Track original for diff
  const [loadingPrompt, setLoadingPrompt] = useState<boolean>(false);
  // For existing projects: followup prompt to send to Dan
  const [followupPrompt, setFollowupPrompt] = useState<string>('');
  // Track if project has SPEC.md (auto-generated from idea)
  const [hasSpec, setHasSpec] = useState<boolean>(false);

  // Fetch prompt.md and check for SPEC.md when project is selected
  const fetchProjectPrompt = async (projectName: string) => {
    setLoadingPrompt(true);
    try {
      const result = await invoke<string | { content: string }>('read_project_file', {
        project_name: projectName,
        file_path: 'prompt.md',
      });
      const content = typeof result === 'string' ? result : result?.content ?? '';
      setOriginalPrompt(content);
      setSavedOriginalPrompt(content);
    } catch {
      // No prompt.md exists yet - that's fine
      setOriginalPrompt('');
      setSavedOriginalPrompt('');
    }

    // Check if SPEC.md exists (from idea-to-project conversion)
    try {
      await invoke<string | { content: string }>('read_project_file', {
        project_name: projectName,
        file_path: 'SPEC.md',
      });
      setHasSpec(true);
    } catch {
      setHasSpec(false);
    }

    setLoadingPrompt(false);
  };

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setNewProjectName('');
      setNewProjectPrompt('');
      setOriginalPrompt('');
      setSavedOriginalPrompt('');
      setFollowupPrompt('');
      setHasSpec(false);

      // Check if there are any pending or in-progress projects
      const activeProjects = teamProjects.filter(
        p => p.status === 'pending' || p.status === 'inprogress'
      );

      if (activeProjects.length > 0) {
        // Default to existing mode with first active project selected
        setMode('existing');
        const firstProject = activeProjects[0].name;
        setSelectedProject(firstProject);
        fetchProjectPrompt(firstProject);
      } else {
        // No pending/in-progress projects - default to create new
        setMode('new');
        setSelectedProject('');
      }
    }
  }, [open, teamProjects]);

  // Update prompt when project selection changes
  const handleProjectChange = (projectName: string) => {
    setSelectedProject(projectName);
    setFollowupPrompt(''); // Reset followup on project change
    fetchProjectPrompt(projectName);
  };

  // Handle mode change
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === 'new') {
      setNewProjectPrompt('');
    } else if (selectedProject) {
      fetchProjectPrompt(selectedProject);
    }
  };

  // Validation
  // For existing projects with SPEC.md, no prompt is required - agent will start automatically
  const isValid = mode === 'existing'
    ? selectedProject !== '' && (hasSpec || followupPrompt.trim() !== '')
    : newProjectName.trim() !== '' && newProjectPrompt.trim() !== '';

  // Handle launch
  const handleLaunch = () => {
    if (!isValid) return;

    if (mode === 'new') {
      onLaunch({
        projectName: newProjectName.trim(),
        isNew: true,
        initialPrompt: newProjectPrompt.trim(),
      });
    } else {
      // Check if original prompt was modified
      const promptWasModified = originalPrompt.trim() !== savedOriginalPrompt.trim();
      // For SPEC.md projects without followup, pass undefined to trigger auto-start
      const effectiveFollowup = followupPrompt.trim() || undefined;
      onLaunch({
        projectName: selectedProject,
        isNew: false,
        updatedOriginalPrompt: promptWasModified ? originalPrompt.trim() : undefined,
        followupPrompt: effectiveFollowup,
      });
    }
    onOpenChange(false);
  };

  // Group team projects by status for display
  const groupedProjects = {
    inprogress: teamProjects.filter(p => p.status === 'inprogress'),
    pending: teamProjects.filter(p => p.status === 'pending'),
    complete: teamProjects.filter(p => p.status === 'complete'),
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Launch {teamName?.charAt(0).toUpperCase()}{teamName?.slice(1)} Team
          </AlertDialogTitle>
          <AlertDialogDescription>
            Select an existing project or create a new one to launch the team.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Mode Selection */}
          <RadioGroup value={mode} onValueChange={(value) => handleModeChange(value as Mode)}>
            <div className="flex flex-col gap-3">
              {/* Existing Project Option */}
              <div className="flex items-center gap-3">
                <RadioGroupItem value="existing" id="mode-existing" />
                <label htmlFor="mode-existing" className="flex items-center gap-3 cursor-pointer flex-1">
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">Select Existing Project</span>
                </label>
              </div>

              {/* Project Dropdown */}
              <div className="pl-7">
                <Select
                  value={selectedProject}
                  onValueChange={handleProjectChange}
                  disabled={mode !== 'existing' || teamProjects.length === 0}
                >
                  <SelectTrigger className="w-full bg-secondary/50 border-border">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamProjects.length > 0 && (
                      <>
                        {groupedProjects.inprogress.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>In Progress</SelectLabel>
                            {groupedProjects.inprogress.map(p => (
                              <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {groupedProjects.pending.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Pending</SelectLabel>
                            {groupedProjects.pending.map(p => (
                              <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {groupedProjects.complete.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Complete</SelectLabel>
                            {groupedProjects.complete.map(p => (
                              <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* New Project Option */}
              <div className="flex items-center gap-3">
                <RadioGroupItem value="new" id="mode-new" />
                <label htmlFor="mode-new" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">Create New Project</span>
                </label>
              </div>

              {/* New Project Name Input */}
              <div className="pl-7">
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="project-name"
                  disabled={mode !== 'new'}
                  className="bg-secondary/50"
                />
              </div>
            </div>
          </RadioGroup>

          {/* New Project: Single prompt textarea */}
          {mode === 'new' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Project prompt:
              </label>
              <Textarea
                value={newProjectPrompt}
                onChange={(e) => setNewProjectPrompt(e.target.value)}
                placeholder="Describe the project objectives and initial task..."
                rows={4}
                className="bg-secondary/50"
              />
            </div>
          )}

          {/* Existing Project: Show SPEC.md indicator or prompt fields */}
          {mode === 'existing' && selectedProject && (
            <>
              {/* SPEC.md indicator - project is ready to auto-start */}
              {hasSpec && (
                <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <FileCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-emerald-400 font-medium">SPEC.md found</span>
                    <span className="text-xs text-muted-foreground">
                      First phase agent will start automatically with the specification
                    </span>
                  </div>
                </div>
              )}

              {/* Original Prompt (from prompt.md) - collapsed when SPEC.md exists */}
              {!hasSpec && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Original prompt:
                    {originalPrompt !== savedOriginalPrompt && (
                      <span className="text-xs text-amber-400">(modified)</span>
                    )}
                  </label>
                  {loadingPrompt ? (
                    <div className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2
                      text-muted-foreground text-sm h-20 flex items-center justify-center">
                      Loading...
                    </div>
                  ) : (
                    <Textarea
                      value={originalPrompt}
                      onChange={(e) => setOriginalPrompt(e.target.value)}
                      placeholder="No original prompt found for this project"
                      rows={3}
                      className="bg-secondary/30"
                    />
                  )}
                </div>
              )}

              {/* Followup Prompt - optional when SPEC.md exists */}
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {hasSpec ? 'Additional instructions (optional):' : 'Followup prompt for Dan:'}
                </label>
                <Textarea
                  value={followupPrompt}
                  onChange={(e) => setFollowupPrompt(e.target.value)}
                  placeholder={hasSpec
                    ? "Optional: Add specific instructions or context..."
                    : "Enter instructions to resume work on this project..."
                  }
                  rows={hasSpec ? 2 : 3}
                  className="bg-secondary/50"
                />
              </div>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleLaunch}
            disabled={!isValid || isLoading}
            className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          >
            <Rocket />
            {isLoading ? 'Launching...' : 'Launch Team'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
