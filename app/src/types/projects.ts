export type ProjectStatus = 'complete' | 'inprogress' | 'pending';

export interface ProjectInfo {
  name: string;
  path: string;
  file_count: number;
  last_modified: string;
  status: ProjectStatus;
  status_detail: string | null;
  existing_files: string[];
  missing_files: string[];
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
