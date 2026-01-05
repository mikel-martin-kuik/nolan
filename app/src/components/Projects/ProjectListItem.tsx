import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, FileText, FilePlus2, Sparkles } from 'lucide-react';
import { ProjectInfo, ProjectFile } from '@/types/projects';
import { cn } from '@/lib/utils';

// File type icon mapping
const FILE_TYPE_COLORS: Record<string, string> = {
  'context': 'text-blue-500',
  'NOTES': 'text-violet-500',
  'research': 'text-green-500',
  'plan': 'text-yellow-500',
  'qa-review': 'text-red-500',
  'progress': 'text-cyan-500',
};

interface ProjectListItemProps {
  project: ProjectInfo;
  isExpanded: boolean;
  isSelected: boolean;
  selectedFile: string | null;
  onToggle: () => void;
  onFileSelect: (file: string) => void;
}

export function ProjectListItem({
  project,
  isExpanded,
  isSelected,
  selectedFile,
  onToggle,
  onFileSelect
}: ProjectListItemProps) {
  const { data: files } = useQuery({
    queryKey: ['project-files', project.name],
    queryFn: async () => invoke<ProjectFile[]>('list_project_files', {
      projectName: project.name
    }),
    enabled: isExpanded,
    refetchInterval: isExpanded ? 10000 : false, // Refresh every 10s when expanded (reduced from 5s)
  });

  // Calculate progress
  const totalExpected = project.existing_files.length + project.missing_files.length;
  const progressPercent = totalExpected > 0
    ? Math.round((project.existing_files.length / totalExpected) * 100)
    : 0;

  return (
    <div className="mb-2">
      {/* Project Header */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 p-3 rounded-xl transition-colors",
          isSelected ? "bg-primary/20" : "hover:bg-accent"
        )}
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 transition-transform flex-shrink-0",
            isExpanded ? "rotate-0" : "-rotate-90"
          )}
        />
        <div className="flex-1 text-left min-w-0">
          <span className="font-medium text-foreground block truncate">
            {project.name}
          </span>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progressPercent === 100 ? "bg-green-500" :
                  progressPercent >= 50 ? "bg-yellow-500" : "bg-primary"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {project.existing_files.length}/{totalExpected}
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {project.file_count} files
        </span>
      </button>

      {/* File List (when expanded) */}
      {isExpanded && files && (
        <div className="ml-6 mt-1 space-y-1">
          {files.map(file => (
            <button
              key={file.relative_path}
              onClick={() => !file.is_placeholder && onFileSelect(file.relative_path)}
              disabled={file.is_placeholder}
              className={cn(
                "w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left",
                file.is_placeholder
                  ? "opacity-40 cursor-not-allowed border border-dashed border-muted-foreground/30"
                  : selectedFile === file.relative_path
                    ? "bg-primary/30 text-foreground"
                    : "hover:bg-accent text-muted-foreground"
              )}
            >
              {file.is_placeholder ? (
                <FilePlus2 className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <FileText
                  className={cn(
                    "w-3.5 h-3.5",
                    FILE_TYPE_COLORS[file.file_type] || "text-muted-foreground"
                  )}
                />
              )}

              <span className={cn(
                "text-sm flex-1 truncate",
                file.is_placeholder && "italic"
              )}>
                {file.name}
              </span>

              {/* Right side: badges and timestamps */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {file.is_placeholder ? (
                  <span className="text-[10px] text-muted-foreground italic">
                    Not created
                  </span>
                ) : (
                  <>
                    {/* Recent badge */}
                    {file.is_recent && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
                        <Sparkles className="w-2.5 h-2.5" />
                        NEW
                      </span>
                    )}
                    {/* Timestamp */}
                    {file.last_modified_ago && (
                      <span className="text-[10px] text-muted-foreground">
                        {file.last_modified_ago}
                      </span>
                    )}
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
