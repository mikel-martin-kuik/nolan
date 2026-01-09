import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { ChevronDown, FileText, Circle } from 'lucide-react';
import { ProjectInfo, ProjectFile } from '@/types/projects';
import { getWorkflowSteps, getFileOrder } from '@/types';
import { useTeamStore } from '@/store/teamStore';
import { cn } from '@/lib/utils';

interface ProjectListItemProps {
  project: ProjectInfo;
  isExpanded: boolean;
  isSelected: boolean;
  selectedFile: string | null;
  onToggle: () => void;
  onFileSelect: (file: string) => void;
}

export const ProjectListItem = memo(function ProjectListItem({
  project,
  isExpanded,
  isSelected,
  selectedFile,
  onToggle,
  onFileSelect
}: ProjectListItemProps) {
  // Get team config for this project's team (not the current active team)
  const teamConfigs = useTeamStore(state => state.teamConfigs);
  const projectTeamConfig = teamConfigs.get(project.team) ?? null;

  const { data: files } = useQuery({
    queryKey: ['project-files', project.name],
    queryFn: async () => invoke<ProjectFile[]>('list_project_files', {
      projectName: project.name
    }),
    enabled: isExpanded,
    // Increased refetch interval from 10s to 30s for better performance
    refetchInterval: isExpanded ? 30000 : false,
  });

  // Get dynamic workflow steps from the project's team config
  const workflowSteps = getWorkflowSteps(projectTeamConfig);
  const fileOrder = getFileOrder(projectTeamConfig);

  // Calculate workflow step completion (memoized)
  // Uses file_completions from backend which checks for HANDOFF markers
  // Special case: "close" step checks project status instead of file
  const stepCompletion = useMemo(() => workflowSteps.map(step => {
    // Special handling for "close" step - check project status
    if (step.key === 'close') {
      return { ...step, complete: project.status === 'complete' };
    }

    const fileKey = `${step.key}.md`;

    // Find the file completion info for this step
    // Use exact match to avoid "plan" matching "plan-review"
    const completion = project.file_completions.find(f =>
      f.file === fileKey || f.file === step.key
    );

    if (completion) {
      // All workflow files require HANDOFF marker to be considered complete
      return { ...step, complete: completion.exists && completion.completed };
    }

    // Fallback: check existing_files with exact match
    const exactMatch = project.existing_files.some(f =>
      f === fileKey || f === `${step.key}.md`
    );

    return { ...step, complete: exactMatch };
  }), [workflowSteps, project.status, project.file_completions, project.existing_files]);

  const completedCount = stepCompletion.filter(s => s.complete).length;

  // Sort files by workflow order (memoized to prevent recalculation on every render)
  const sortedFiles = useMemo(() => {
    if (!files) return undefined;
    return files.slice().sort((a, b) => {
      const aOrder = fileOrder[a.file_type] ?? 99;
      const bOrder = fileOrder[b.file_type] ?? 99;
      return aOrder - bOrder;
    });
  }, [files, fileOrder]);

  return (
    <div className="mb-1">
      {/* Project Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2.5 rounded-lg transition-colors hover:bg-accent/50"
      >
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
            isExpanded ? "rotate-0" : "-rotate-90"
          )}
        />

        <span className="flex-1 text-left font-medium text-sm text-foreground truncate">
          {project.name}
        </span>

        {/* Step Progress - 4 Dots */}
        <div className="flex items-center gap-0.5">
          {stepCompletion.map((step) => (
            <div
              key={step.key}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                step.complete ? "bg-primary" : "bg-muted-foreground/20"
              )}
            />
          ))}
          <span className="text-[10px] text-muted-foreground ml-1.5">
            {completedCount}/{workflowSteps.length}
          </span>
        </div>
      </button>

      {/* File List */}
      {isExpanded && sortedFiles && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {sortedFiles.map(file => {
            const isPrompt = file.file_type === 'prompt';

            return (
              <button
                key={file.relative_path}
                onClick={() => !file.is_placeholder && onFileSelect(file.relative_path)}
                disabled={file.is_placeholder}
                className={cn(
                  "w-full flex items-center gap-2 py-1.5 rounded text-left text-xs transition-colors",
                  // Prompt has no left padding, workflow files are indented
                  isPrompt ? "px-0" : "px-2 ml-2",
                  file.is_placeholder && "opacity-40 cursor-not-allowed",
                  !file.is_placeholder && isSelected && selectedFile === file.relative_path && "bg-foreground/10 text-foreground",
                  !file.is_placeholder && !(isSelected && selectedFile === file.relative_path) && "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {/* Prompt has no icon, workflow files have FileText/Circle */}
                {!isPrompt && (
                  file.is_placeholder ? (
                    <Circle className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <FileText className="w-3 h-3 flex-shrink-0" />
                  )
                )}

                <span className={cn("flex-1 truncate", file.is_placeholder && "italic")}>
                  {/* Prompt shows "Prompt" without .md, others show full name */}
                  {isPrompt ? 'Prompt' : file.name}
                </span>

                {!file.is_placeholder && file.is_recent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}

                {!file.is_placeholder && file.last_modified_ago && !file.is_recent && (
                  <span className="text-[10px] text-muted-foreground/70">
                    {file.last_modified_ago}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

ProjectListItem.displayName = 'ProjectListItem';
