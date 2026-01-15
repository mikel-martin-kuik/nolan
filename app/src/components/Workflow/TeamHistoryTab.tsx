import React, { useEffect, useCallback, useState } from 'react';
import { invoke } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, CheckCircle2, XCircle, FolderKanban, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamConfig } from '@/types';
import type { ProjectInfo, ProjectStatus } from '@/types/projects';

interface TeamHistoryTabProps {
  teamConfig: TeamConfig | null;
}

// Project status badge component
const ProjectStatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const statusConfig: Record<ProjectStatus, { color: string; icon: React.ReactNode; label: string }> = {
    complete: { color: 'bg-green-500/20 text-green-600', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Complete' },
    inprogress: { color: 'bg-blue-500/20 text-blue-600', icon: <Clock className="w-3 h-3" />, label: 'In Progress' },
    pending: { color: 'bg-yellow-500/20 text-yellow-600', icon: <Circle className="w-3 h-3" />, label: 'Pending' },
    delegated: { color: 'bg-purple-500/20 text-purple-600', icon: <Users className="w-3 h-3" />, label: 'Delegated' },
    archived: { color: 'bg-gray-500/20 text-gray-600', icon: <XCircle className="w-3 h-3" />, label: 'Archived' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant="secondary" className={cn('gap-1 text-[10px]', config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  );
};

export const TeamHistoryTab: React.FC<TeamHistoryTabProps> = ({
  teamConfig,
}) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch projects for this team
  const fetchProjects = useCallback(async () => {
    if (!teamConfig?.team?.name) return;
    try {
      const allProjects = await invoke<ProjectInfo[]>('list_projects');
      // Filter projects that belong to this team
      const teamProjects = allProjects.filter(p => p.team === teamConfig.team.name);
      setProjects(teamProjects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, [teamConfig?.team?.name]);

  // Load data on mount and when team changes
  useEffect(() => {
    setLoading(true);
    fetchProjects().finally(() => {
      setLoading(false);
    });
  }, [fetchProjects, teamConfig?.team?.name]);

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (!teamConfig) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FolderKanban className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">Select a team to view projects</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* Team Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Team Projects
          </h3>
          <Badge variant="secondary" className="text-[10px]">
            {projects.length} projects
          </Badge>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-8">
              <Clock className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
            </div>
          ) : (
            projects.map((project) => {
              // Calculate workflow progress
              const completedPhases = project.file_completions.filter(fc => fc.completed).length;
              const totalPhases = project.file_completions.length;
              const progressPercent = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

              return (
                <div
                  key={project.name}
                  className="p-3 rounded-lg bg-card/50 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{project.name}</span>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  {/* Workflow progress */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Workflow Progress</span>
                      <span>{completedPhases}/{totalPhases} phases</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          progressPercent === 100 ? 'bg-green-500' :
                          progressPercent > 0 ? 'bg-blue-500' : 'bg-muted'
                        )}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  {/* Phase completion indicators */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {project.file_completions.map((fc) => (
                      <div
                        key={fc.file}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px]',
                          fc.completed
                            ? 'bg-green-500/20 text-green-600'
                            : fc.exists
                            ? 'bg-yellow-500/20 text-yellow-600'
                            : 'bg-muted text-muted-foreground'
                        )}
                        title={fc.completed ? `Completed by ${fc.completed_by}` : fc.exists ? 'In progress' : 'Not started'}
                      >
                        {fc.file.replace('.md', '')}
                      </div>
                    ))}
                  </div>
                  {/* Last modified */}
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {project.last_modified && formatTimeAgo(project.last_modified)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
