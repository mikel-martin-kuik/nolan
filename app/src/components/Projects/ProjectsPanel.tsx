import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { ProjectList } from './ProjectList';
import { ProjectFileViewer } from './ProjectFileViewer';
import { ProjectInfo, ProjectStatus } from '@/types/projects';
import { CheckCircle2, Clock, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabType = 'inprogress' | 'pending' | 'complete';

const TABS: { id: TabType; label: string; icon: React.ReactNode; status: ProjectStatus }[] = [
  { id: 'inprogress', label: 'In Progress', icon: <Clock className="w-4 h-4" />, status: 'inprogress' },
  { id: 'pending', label: 'Pending', icon: <CircleDashed className="w-4 h-4" />, status: 'pending' },
  { id: 'complete', label: 'Complete', icon: <CheckCircle2 className="w-4 h-4" />, status: 'complete' },
];

export function ProjectsPanel() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('inprogress');

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => invoke<ProjectInfo[]>('list_projects'),
    refetchInterval: 30000, // Refresh every 30 seconds (reduced from 10s for better performance)
  });

  // Group projects by status
  const groupedProjects = useMemo(() => {
    if (!projects) return { inprogress: [], pending: [], complete: [] };

    return projects.reduce((acc, project) => {
      acc[project.status].push(project);
      return acc;
    }, { inprogress: [] as ProjectInfo[], pending: [] as ProjectInfo[], complete: [] as ProjectInfo[] });
  }, [projects]);

  const handleFileSelect = (project: string, file: string) => {
    setSelectedProject(project);
    setSelectedFile(file);
  };

  const currentProjects = groupedProjects[activeTab] || [];

  return (
    <div className="h-full">
      <div className="w-full space-y-6 h-full flex flex-col">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
            Projects
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and track your team projects
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden gap-6 min-h-0">
          {/* Left: Project List with Tabs */}
          <div className="w-1/3 flex flex-col overflow-hidden">
        {/* Tab Bar */}
        <div className="flex gap-1 mb-3 bg-card/30 p-1 rounded-xl">
          {TABS.map((tab) => {
            const count = groupedProjects[tab.id]?.length ?? 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <span className={cn(
                    "ml-1 px-1.5 py-0.5 rounded-full text-xs",
                    activeTab === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ProjectList
          projects={currentProjects}
          isLoading={isLoading}
          error={error ? String(error) : null}
          selectedProject={selectedProject}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          activeTab={activeTab}
        />
      </div>

      {/* Right: File Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ProjectFileViewer
          project={selectedProject}
          file={selectedFile}
        />
      </div>
        </div>
      </div>
    </div>
  );
}
