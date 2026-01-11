import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { useTeamStore } from '@/store/teamStore';
import type { ProjectInfo, FileCompletion } from '@/types/projects';

type TabType = 'inprogress' | 'pending' | 'complete';

export interface GroupedProjects {
  inprogress: ProjectInfo[];
  pending: ProjectInfo[];
  complete: ProjectInfo[];
}

export interface ProjectStats {
  active: number;
  queued: number;
  done: number;
}

export interface UseProjectsResult {
  projects: ProjectInfo[] | undefined;
  groupedProjects: GroupedProjects;
  stats: ProjectStats;
  isLoading: boolean;
  error: Error | null;
  selectedProject: string | null;
  selectedFile: string | null;
  activeTab: TabType;
  currentProjects: ProjectInfo[];
  selectedFileCompletion: FileCompletion | null;
  isWorkflowFile: boolean;
  setSelectedProject: (project: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  setActiveTab: (tab: TabType) => void;
  handleFileSelect: (project: string, file: string) => void;
}

/**
 * Hook for managing projects list, grouping, and selection.
 *
 * Combines project data fetching with grouping by status,
 * tab management, and file selection state.
 */
export function useProjects(): UseProjectsResult {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('inprogress');

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

  const groupedProjects = useMemo((): GroupedProjects => {
    if (!projects) return { inprogress: [], pending: [], complete: [] };

    return projects.reduce((acc, project) => {
      const tabKey =
        project.status === 'complete' || project.status === 'archived' ? 'complete' :
        project.status === 'pending' ? 'pending' :
        'inprogress';

      acc[tabKey].push(project);
      return acc;
    }, { inprogress: [] as ProjectInfo[], pending: [] as ProjectInfo[], complete: [] as ProjectInfo[] });
  }, [projects]);

  const stats = useMemo((): ProjectStats => ({
    active: groupedProjects.inprogress.length,
    queued: groupedProjects.pending.length,
    done: groupedProjects.complete.length,
  }), [groupedProjects]);

  const currentProjects = groupedProjects[activeTab] || [];

  const selectedFileCompletion = useMemo(() => {
    if (!selectedProject || !selectedFile || !projects) return null;
    const project = projects.find(p => p.name === selectedProject);
    if (!project) return null;
    const fileName = selectedFile.split('/').pop() || selectedFile;
    const fileType = fileName.replace('.md', '');
    return project.file_completions.find(f =>
      f.file === fileName || f.file === fileType
    ) || null;
  }, [selectedProject, selectedFile, projects]);

  const isWorkflowFile = useMemo(() => {
    if (!selectedFile || !selectedProject || !projects) return false;
    const fileName = selectedFile.split('/').pop() || selectedFile;
    const project = projects.find(p => p.name === selectedProject);
    if (!project) return false;
    return project.workflow_files.includes(fileName);
  }, [selectedFile, selectedProject, projects]);

  const handleFileSelect = (project: string, file: string) => {
    setSelectedProject(project);
    setSelectedFile(file);
  };

  return {
    projects,
    groupedProjects,
    stats,
    isLoading,
    error: error as Error | null,
    selectedProject,
    selectedFile,
    activeTab,
    currentProjects,
    selectedFileCompletion,
    isWorkflowFile,
    setSelectedProject,
    setSelectedFile,
    setActiveTab,
    handleFileSelect,
  };
}
