export type ProjectStatus = 'complete' | 'inprogress' | 'pending' | 'delegated' | 'archived';

/**
 * Display metadata for project statuses
 * @deprecated Use useProjectStatusConfig() from hooks/useUIConfig instead.
 * This constant is kept for backward compatibility during migration.
 */
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  inprogress: { label: 'In Progress', color: 'text-blue-500' },
  pending: { label: 'Pending', color: 'text-yellow-500' },
  delegated: { label: 'Delegated', color: 'text-purple-500' },
  complete: { label: 'Complete', color: 'text-green-500' },
  archived: { label: 'Archived', color: 'text-muted-foreground' },
};

/**
 * All valid status values in display order
 * @deprecated Use useProjectStatusConfig().values from hooks/useUIConfig instead.
 */
export const PROJECT_STATUS_OPTIONS: ProjectStatus[] = ['inprogress', 'pending', 'delegated', 'complete', 'archived'];

/** Completion status for a workflow file based on HANDOFF markers */
export interface FileCompletion {
  file: string;
  exists: boolean;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
}

export interface ProjectInfo {
  name: string;
  path: string;
  file_count: number;
  last_modified: string;
  status: ProjectStatus;
  status_detail: string | null;
  existing_files: string[];
  missing_files: string[];
  file_completions: FileCompletion[];
  team: string;  // Team that owns this project (from .team file)
  workflow_files: string[];  // Workflow phase outputs stored at project creation
}

export interface ProjectFile {
  name: string;
  relative_path: string;
  file_type: string;
  size: number;
  last_modified: string;
  is_placeholder: boolean;
  last_modified_ago: string | null;
  is_recent: boolean;
}

/** Response from get_project_info_by_path - returns project context for a filesystem path */
export interface ProjectPathInfo {
  /** Whether the path is within the projects directory */
  is_in_projects: boolean;
  /** Whether the path is at the projects root (listing all projects) */
  is_projects_root: boolean;
  /** Project info if path is within a specific project directory */
  project: ProjectInfo | null;
  /** The projects root path (for navigation) */
  projects_root: string;
}
