import { useState } from 'react';
import { ProjectListItem } from './ProjectListItem';
import { ProjectInfo } from '@/types/projects';
import { FolderOpen, RefreshCw } from 'lucide-react';

type TabType = 'inprogress' | 'pending' | 'complete';

const TAB_EMPTY: Record<TabType, { message: string; hint: string }> = {
  inprogress: {
    message: 'No active projects',
    hint: 'Projects being worked on appear here',
  },
  pending: {
    message: 'No queued projects',
    hint: 'Projects waiting to start appear here',
  },
  complete: {
    message: 'No completed projects',
    hint: 'Finished projects appear here',
  },
};

interface ProjectListProps {
  projects?: ProjectInfo[];
  isLoading: boolean;
  error: string | null;
  selectedProject: string | null;
  selectedFile: string | null;
  onFileSelect: (project: string, file: string) => void;
  activeTab: TabType;
}

export function ProjectList({
  projects,
  isLoading,
  error,
  selectedProject,
  selectedFile,
  onFileSelect,
  activeTab,
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const toggleProject = (projectName: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  const empty = TAB_EMPTY[activeTab];

  return (
    <div className="glass-card rounded-xl h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 px-4">
            <FolderOpen className="w-5 h-5 text-red-500 mx-auto mb-2" />
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        {projects && projects.length === 0 && !isLoading && !error && (
          <div className="flex items-center justify-center py-12 px-4">
            <div className="text-center">
              <FolderOpen className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">{empty.message}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{empty.hint}</p>
            </div>
          </div>
        )}

        {projects && projects.map(project => (
          <ProjectListItem
            key={project.name}
            project={project}
            isExpanded={expandedProjects.has(project.name)}
            isSelected={selectedProject === project.name}
            selectedFile={selectedFile}
            onToggle={() => toggleProject(project.name)}
            onFileSelect={(file) => onFileSelect(project.name, file)}
          />
        ))}
      </div>
    </div>
  );
}
