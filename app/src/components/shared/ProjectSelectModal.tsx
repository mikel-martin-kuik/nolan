import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertDialog,
  AlertDialogContent,
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
import { ProjectInfo } from '@/types/projects';
import { FolderOpen, Plus, Rocket, FileText, MessageSquare } from 'lucide-react';

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

  // Fetch prompt.md content when project is selected
  const fetchProjectPrompt = async (projectName: string) => {
    setLoadingPrompt(true);
    try {
      const content = await invoke<string>('read_project_file', {
        projectName,
        filePath: 'prompt.md',
      });
      setOriginalPrompt(content);
      setSavedOriginalPrompt(content);
    } catch {
      // No prompt.md exists yet - that's fine
      setOriginalPrompt('');
      setSavedOriginalPrompt('');
    } finally {
      setLoadingPrompt(false);
    }
  };

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode('existing');
      setNewProjectName('');
      setNewProjectPrompt('');
      setOriginalPrompt('');
      setSavedOriginalPrompt('');
      setFollowupPrompt('');
      // Select first team project by default if available
      if (teamProjects.length > 0) {
        const firstProject = teamProjects[0].name;
        setSelectedProject(firstProject);
        fetchProjectPrompt(firstProject);
      } else {
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
  const isValid = mode === 'existing'
    ? selectedProject !== '' && followupPrompt.trim() !== ''
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
      onLaunch({
        projectName: selectedProject,
        isNew: false,
        updatedOriginalPrompt: promptWasModified ? originalPrompt.trim() : undefined,
        followupPrompt: followupPrompt.trim(),
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
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Mode Selection */}
          <div className="flex flex-col gap-2">
            {/* Existing Project Option */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="mode"
                checked={mode === 'existing'}
                onChange={() => handleModeChange('existing')}
                className="w-4 h-4 text-primary shrink-0"
              />
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Select Existing Project</span>
            </label>

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
            <label className="flex items-center gap-3 cursor-pointer mt-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'new'}
                onChange={() => handleModeChange('new')}
                className="w-4 h-4 text-primary shrink-0"
              />
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Create New Project</span>
            </label>

            {/* New Project Name Input */}
            <div className="pl-7">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="project-name"
                disabled={mode !== 'new'}
                className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                  text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                  focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* New Project: Single prompt textarea */}
          {mode === 'new' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Project prompt:
              </label>
              <textarea
                value={newProjectPrompt}
                onChange={(e) => setNewProjectPrompt(e.target.value)}
                placeholder="Describe the project objectives and initial task..."
                rows={4}
                className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                  text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                  focus:ring-primary/50 resize-none"
              />
            </div>
          )}

          {/* Existing Project: Two boxes */}
          {mode === 'existing' && selectedProject && (
            <>
              {/* Original Prompt (from prompt.md) */}
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
                  <textarea
                    value={originalPrompt}
                    onChange={(e) => setOriginalPrompt(e.target.value)}
                    placeholder="No original prompt found for this project"
                    rows={3}
                    className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2
                      text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                      focus:ring-primary/50 resize-none"
                  />
                )}
              </div>

              {/* Followup Prompt (to send to Dan) */}
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Followup prompt for Dan:
                </label>
                <textarea
                  value={followupPrompt}
                  onChange={(e) => setFollowupPrompt(e.target.value)}
                  placeholder="Enter instructions to resume work on this project..."
                  rows={3}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                    text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                    focus:ring-primary/50 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground
              transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={!isValid || isLoading}
            className="px-4 py-2 text-sm bg-emerald-500/20 text-emerald-400 rounded-lg
              hover:bg-emerald-500/30 transition-colors disabled:opacity-50
              disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Rocket className="w-4 h-4" />
            {isLoading ? 'Launching...' : 'Launch Team'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
