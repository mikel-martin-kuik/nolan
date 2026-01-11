import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { ProjectList } from './ProjectList';
import { ProjectFileViewer } from './ProjectFileViewer';
import { RoadmapViewer } from './RoadmapViewer';
import { ProjectInfo } from '@/types/projects';
import { useTeamStore } from '@/store/teamStore';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
        const content = await invoke<string>('read_roadmap', { filename: null });
        const versionMatch = content.match(/Current State \((v[\d.]+)\)/);
        // Match vision in blockquote format: > **Vision**: ...
        const visionMatch = content.match(/>\s*\*\*Vision\*\*:\s*([^\n]+)/);
        setRoadmapSummary({
          version: versionMatch ? versionMatch[1] : 'v0.x',
          vision: visionMatch ? visionMatch[1].trim() : 'AI-powered software development platform'
        });
      } catch {
        setRoadmapSummary({ version: 'v0.x', vision: 'AI-powered software development platform' });
      }
    };
    loadRoadmapSummary();
  }, []);

  // Group projects by status (mapping 5 statuses to 3 tabs)
  // Active tab: inprogress, delegated
  // Queued tab: pending
  // Done tab: complete, archived
  const groupedProjects = useMemo(() => {
    if (!projects) return { inprogress: [], pending: [], complete: [] };

    return projects.reduce((acc, project) => {
      // Map status to tab
      const tabKey =
        project.status === 'complete' || project.status === 'archived' ? 'complete' :
        project.status === 'pending' ? 'pending' :
        'inprogress'; // inprogress and delegated both go to Active tab

      acc[tabKey].push(project);
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

  // Find file completion info for the selected file
  const selectedFileCompletion = useMemo(() => {
    if (!selectedProject || !selectedFile || !projects) return null;
    const project = projects.find(p => p.name === selectedProject);
    if (!project) return null;
    // Get file name from path
    const fileName = selectedFile.split('/').pop() || selectedFile;
    const fileType = fileName.replace('.md', '');
    return project.file_completions.find(f =>
      f.file === fileName || f.file === fileType
    ) || null;
  }, [selectedProject, selectedFile, projects]);

  // Determine if selected file is a workflow file (can have HANDOFF marker)
  // Uses workflow_files stored in project at creation time
  const isWorkflowFile = useMemo(() => {
    if (!selectedFile || !selectedProject || !projects) return false;

    // Get file name
    const fileName = selectedFile.split('/').pop() || selectedFile;

    // Find the project to get its stored workflow files
    const project = projects.find(p => p.name === selectedProject);
    if (!project) return false;

    // Check if file matches any stored workflow file
    return project.workflow_files.includes(fileName);
  }, [selectedFile, selectedProject, projects]);

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
          {/* Header with New Button and Tabs */}
          <div className="flex items-center gap-2 mb-3">
            <Button size="sm" onClick={() => {/* TODO: Create project */}}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              New
            </Button>
            <div className="flex items-center gap-1 p-1 glass-card rounded-lg flex-1">
              <button
                onClick={() => setActiveTab('inprogress')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all",
                  activeTab === 'inprogress' && "bg-foreground/10 text-foreground",
                  activeTab !== 'inprogress' && "text-muted-foreground hover:text-foreground"
                )}
              >
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
                <span>Done</span>
                {stats.done > 0 && (
                  <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.done}</span>
                )}
              </button>
            </div>
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
              isWorkflowFile={isWorkflowFile}
              fileCompletion={selectedFileCompletion}
            />
          )}
        </div>
      </div>
    </div>
  );
}
