import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { ProjectList } from './ProjectList';
import { ProjectFileViewer } from './ProjectFileViewer';
import { RoadmapViewer } from './RoadmapViewer';
import { ProjectInfo } from '@/types/projects';
import { useTeamStore } from '@/store/teamStore';
import {
  CheckCircle2,
  Clock,
  CircleDashed
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabType = 'inprogress' | 'pending' | 'complete';

export function ProjectsPanel() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('inprogress');
  const [showRoadmap, setShowRoadmap] = useState(true); // Default to roadmap
  const [roadmapSummary, setRoadmapSummary] = useState<{ version: string; vision: string } | null>(null);

  // Load team configs for per-project workflow steps
  const { loadAvailableTeams, loadAllTeams } = useTeamStore();
  useEffect(() => {
    const loadTeams = async () => {
      await loadAvailableTeams();
      await loadAllTeams();
    };
    loadTeams();
  }, [loadAvailableTeams, loadAllTeams]);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => invoke<ProjectInfo[]>('list_projects'),
    refetchInterval: 30000,
  });

  // Load roadmap summary
  useEffect(() => {
    const loadRoadmapSummary = async () => {
      try {
        const content = await invoke<string>('read_roadmap');
        const versionMatch = content.match(/Current State \((v[\d.]+)\)/);
        const visionMatch = content.match(/\*\*Vision\*\*:\s*([^\n]+)/);
        setRoadmapSummary({
          version: versionMatch ? versionMatch[1] : 'v0.x',
          vision: visionMatch ? visionMatch[1] : 'Organizational Agent Management System'
        });
      } catch {
        setRoadmapSummary({ version: 'v0.x', vision: 'Agent orchestration platform' });
      }
    };
    loadRoadmapSummary();
  }, []);

  // Group projects by status
  const groupedProjects = useMemo(() => {
    if (!projects) return { inprogress: [], pending: [], complete: [] };

    return projects.reduce((acc, project) => {
      acc[project.status].push(project);
      return acc;
    }, { inprogress: [] as ProjectInfo[], pending: [] as ProjectInfo[], complete: [] as ProjectInfo[] });
  }, [projects]);

  // Calculate stats
  const stats = useMemo(() => ({
    active: groupedProjects.inprogress.length,
    queued: groupedProjects.pending.length,
    done: groupedProjects.complete.length,
  }), [groupedProjects]);

  const handleFileSelect = (project: string, file: string) => {
    setSelectedProject(project);
    setSelectedFile(file);
    setShowRoadmap(false); // Switch from roadmap to file view
  };

  const handleRoadmapClick = () => {
    setShowRoadmap(true);
    setSelectedProject(null);
    setSelectedFile(null);
  };

  const currentProjects = groupedProjects[activeTab] || [];

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Roadmap Banner - Header */}
      <button
        onClick={handleRoadmapClick}
        className={cn(
          "w-full p-3 rounded-xl transition-all border",
          showRoadmap
            ? "bg-accent/50 border-border"
            : "border-border/50 hover:border-border hover:bg-accent/30"
        )}
      >
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold text-foreground">Nolan Roadmap</span>
          {roadmapSummary && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10 text-muted-foreground font-medium">
              {roadmapSummary.version}
            </span>
          )}
        </div>
      </button>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
        {/* Left: Project List with Tabs */}
        <div className="w-[320px] flex flex-col overflow-hidden flex-shrink-0">
          {/* Tab Bar - Minimal */}
          <div className="flex items-center gap-1 mb-3 p-1 glass-card rounded-lg">
            <button
              onClick={() => setActiveTab('inprogress')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
                activeTab === 'inprogress' && "bg-foreground/10 text-foreground",
                activeTab !== 'inprogress' && "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Active</span>
              {stats.active > 0 && (
                <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.active}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
                activeTab === 'pending' && "bg-foreground/10 text-foreground",
                activeTab !== 'pending' && "text-muted-foreground hover:text-foreground"
              )}
            >
              <CircleDashed className="w-3.5 h-3.5" />
              <span>Queued</span>
              {stats.queued > 0 && (
                <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.queued}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('complete')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
                activeTab === 'complete' && "bg-foreground/10 text-foreground",
                activeTab !== 'complete' && "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done</span>
              {stats.done > 0 && (
                <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.done}</span>
              )}
            </button>
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

        {/* Right: File Viewer or Roadmap */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showRoadmap ? (
            <RoadmapViewer />
          ) : (
            <ProjectFileViewer
              project={selectedProject}
              file={selectedFile}
            />
          )}
        </div>
      </div>
    </div>
  );
}
