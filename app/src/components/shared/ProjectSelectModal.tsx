import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { ProjectInfo } from '@/types/projects';
import { FolderOpen, Plus, Rocket } from 'lucide-react';

interface ProjectSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (projectName: string, initialPrompt: string, isNew: boolean) => void;
  projects: ProjectInfo[];
  isLoading?: boolean;
}

type Mode = 'existing' | 'new';

export const ProjectSelectModal: React.FC<ProjectSelectModalProps> = ({
  open,
  onOpenChange,
  onLaunch,
  projects,
  isLoading = false,
}) => {
  const [mode, setMode] = useState<Mode>('existing');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode('existing');
      setNewProjectName('');
      // Select first project by default if available
      if (projects.length > 0) {
        const firstProject = projects[0].name;
        setSelectedProject(firstProject);
        setPrompt(`Continue with ${firstProject}`);
      } else {
        setSelectedProject('');
        setPrompt('');
      }
    }
  }, [open, projects]);

  // Update prompt when project selection changes
  const handleProjectChange = (projectName: string) => {
    setSelectedProject(projectName);
    setPrompt(`Continue with ${projectName}`);
  };

  // Handle mode change
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === 'new') {
      setPrompt('');
    } else if (selectedProject) {
      setPrompt(`Continue with ${selectedProject}`);
    }
  };

  // Validation
  const isValid = mode === 'existing'
    ? selectedProject !== ''
    : newProjectName.trim() !== '' && prompt.trim() !== '';

  // Handle launch
  const handleLaunch = () => {
    if (!isValid) return;

    const projectName = mode === 'existing' ? selectedProject : newProjectName.trim();
    onLaunch(projectName, prompt, mode === 'new');
    onOpenChange(false);
  };

  // Group projects by status for display
  const groupedProjects = {
    inprogress: projects.filter(p => p.status === 'inprogress'),
    pending: projects.filter(p => p.status === 'pending'),
    complete: projects.filter(p => p.status === 'complete'),
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Launch Core Team
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
                className="w-4 h-4 text-primary"
              />
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Select Existing Project</span>
            </label>

            {/* Project Dropdown */}
            <select
              value={selectedProject}
              onChange={(e) => handleProjectChange(e.target.value)}
              disabled={mode !== 'existing' || projects.length === 0}
              className="ml-7 w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {projects.length === 0 ? (
                <option value="">No projects available</option>
              ) : (
                <>
                  {groupedProjects.inprogress.length > 0 && (
                    <optgroup label="In Progress">
                      {groupedProjects.inprogress.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {groupedProjects.pending.length > 0 && (
                    <optgroup label="Pending">
                      {groupedProjects.pending.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {groupedProjects.complete.length > 0 && (
                    <optgroup label="Complete">
                      {groupedProjects.complete.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>

            {/* New Project Option */}
            <label className="flex items-center gap-3 cursor-pointer mt-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'new'}
                onChange={() => handleModeChange('new')}
                className="w-4 h-4 text-primary"
              />
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Create New Project</span>
            </label>

            {/* New Project Name Input */}
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="project-name"
              disabled={mode !== 'new'}
              className="ml-7 w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Prompt Textarea */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">
              Initial prompt for Dan:
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === 'new' ? 'Describe the project and initial task...' : ''}
              rows={3}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2
                text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2
                focus:ring-primary/50 resize-none"
            />
          </div>
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
