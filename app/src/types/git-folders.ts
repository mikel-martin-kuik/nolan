// Git Folders Types
// Matches the Rust types in src-tauri/src/git/folders.rs

export type GitFolderStatus = 'ready' | 'cloning' | 'clone_failed' | 'removed';

export interface GitFolder {
  id: string;
  name: string;
  origin_url: string;
  local_path: string;
  current_branch: string;
  tags: string[];
  created_at: string;
  last_synced_at?: string;
  status: GitFolderStatus;
}

export interface CloneResult {
  success: boolean;
  folder?: GitFolder;
  error?: string;
}

export interface GitFolderWorktree {
  path: string;
  branch: string;
  commit: string;
}

export interface GitFolderWithWorktrees extends GitFolder {
  worktrees: GitFolderWorktree[];
}

export interface ScanResult {
  path: string;
  is_git_repo: boolean;
  name: string;
  origin_url?: string;
  current_branch?: string;
}
