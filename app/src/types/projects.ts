export type ProjectStatus = 'complete' | 'inprogress' | 'pending';

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
