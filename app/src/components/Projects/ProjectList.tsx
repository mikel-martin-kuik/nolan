import { useState } from 'react';
import { ProjectListItem } from './ProjectListItem';
import { ProjectInfo } from '@/types/projects';
import { Clock, CircleDashed, CheckCircle2 } from 'lucide-react';

type TabType = 'inprogress' | 'pending' | 'complete';

const TAB_CONFIG: Record<TabType, { title: string; icon: React.ReactNode; emptyMessage: string }> = {
  inprogress: {
    title: 'In Progress',
    icon: <Clock className="w-5 h-5 text-yellow-500" />,
    emptyMessage: 'No projects currently in progress',
  },
  pending: {
    title: 'Pending',
    icon: <CircleDashed className="w-5 h-5 text-muted-foreground" />,
    emptyMessage: 'No pending projects',
  },
  complete: {
    title: 'Complete',
    icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    emptyMessage: 'No completed projects',
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

  const config = TAB_CONFIG[activeTab];

  return (
    <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl shadow-xl h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          {config.icon}
          <h2 className="text-xl font-semibold text-foreground">{config.title}</h2>
          {projects && (
            <span className="text-sm text-muted-foreground">({projects.length})</span>
          )}
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">
            Loading projects...
          </div>
        )}
        {error && (
          <div className="text-center text-red-500 py-8">
            Error loading projects: {error}
          </div>
        )}
        {projects && projects.length === 0 && !isLoading && !error && (
          <div className="text-center text-muted-foreground py-8">
            {config.emptyMessage}
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
