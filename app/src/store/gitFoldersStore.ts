import { create } from 'zustand';
import { invoke } from '@/lib/api';
import type { GitFolder, GitFolderWithWorktrees, CloneResult, ScanResult } from '@/types/git-folders';

interface GitFoldersState {
  folders: GitFolderWithWorktrees[];
  isLoading: boolean;
  error: string | null;
  cloneDialogOpen: boolean;
  scanResults: ScanResult[];
  isScanDialogOpen: boolean;
}

interface GitFoldersActions {
  loadFolders: () => Promise<void>;
  cloneRepository: (url: string, name?: string) => Promise<CloneResult>;
  fetchFolder: (folderId: string) => Promise<GitFolder>;
  removeFolder: (folderId: string, deleteFiles: boolean) => Promise<void>;
  updateFolder: (folderId: string, name?: string, tags?: string[]) => Promise<GitFolder>;
  scanDirectory: (path: string) => Promise<void>;
  importRepository: (sourcePath: string, name?: string) => Promise<CloneResult>;
  setCloneDialogOpen: (open: boolean) => void;
  setScanDialogOpen: (open: boolean) => void;
  clearScanResults: () => void;
}

type GitFoldersStore = GitFoldersState & GitFoldersActions;

export const useGitFoldersStore = create<GitFoldersStore>((set, get) => ({
  // Initial state
  folders: [],
  isLoading: false,
  error: null,
  cloneDialogOpen: false,
  scanResults: [],
  isScanDialogOpen: false,

  loadFolders: async () => {
    set({ isLoading: true, error: null });
    try {
      const folders = await invoke<GitFolderWithWorktrees[]>('list_git_folders_with_worktrees');
      set({ folders, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  cloneRepository: async (url: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<CloneResult>('clone_git_repository', { url, name });
      if (result.success) {
        // Reload folders to include the new one
        await get().loadFolders();
      } else {
        set({ error: result.error || 'Clone failed' });
      }
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return { success: false, error: String(err) };
    }
  },

  fetchFolder: async (folderId: string) => {
    set({ isLoading: true, error: null });
    try {
      const folder = await invoke<GitFolder>('fetch_git_folder', { folderId });
      // Reload all folders to update the list
      await get().loadFolders();
      set({ isLoading: false });
      return folder;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  removeFolder: async (folderId: string, deleteFiles: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('remove_git_folder', { folderId, deleteFiles });
      await get().loadFolders();
      set({ isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  updateFolder: async (folderId: string, name?: string, tags?: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const folder = await invoke<GitFolder>('update_git_folder', { folderId, name, tags });
      await get().loadFolders();
      set({ isLoading: false });
      return folder;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  scanDirectory: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const results = await invoke<ScanResult[]>('scan_for_git_repositories', { path });
      set({ scanResults: results, isLoading: false, isScanDialogOpen: true });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  importRepository: async (sourcePath: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<CloneResult>('import_git_repository', { sourcePath, name });
      if (result.success) {
        await get().loadFolders();
      } else {
        set({ error: result.error || 'Import failed' });
      }
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return { success: false, error: String(err) };
    }
  },

  setCloneDialogOpen: (open: boolean) => {
    set({ cloneDialogOpen: open });
  },

  setScanDialogOpen: (open: boolean) => {
    set({ isScanDialogOpen: open });
  },

  clearScanResults: () => {
    set({ scanResults: [], isScanDialogOpen: false });
  },
}));
