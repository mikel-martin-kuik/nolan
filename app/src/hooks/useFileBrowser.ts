import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/api';
import { useToastStore } from '@/store/toastStore';
import type {
  DirectoryContents,
  FileContent,
  SearchResult,
  FileSystemEntry,
} from '@/types/filesystem';
import type { ProjectPathInfo } from '@/types/projects';

export interface UseFileBrowserResult {
  // Current directory state
  currentPath: string;
  directory: DirectoryContents | undefined;
  isLoading: boolean;
  error: Error | null;

  // Selected file state
  selectedFile: FileSystemEntry | null;
  fileContent: FileContent | null;
  isLoadingFile: boolean;

  // Search state
  searchQuery: string;
  searchResults: SearchResult[] | null;
  isSearching: boolean;

  // UI state
  showHidden: boolean;

  // Breadcrumb navigation
  breadcrumbs: { name: string; path: string }[];

  // Project context (for project-aware file browsing)
  projectContext: ProjectPathInfo | null;
  isLoadingProjectContext: boolean;
  updateProjectStatus: (status: string) => Promise<void>;

  // Actions
  navigateTo: (path: string) => void;
  navigateUp: () => void;
  selectFile: (entry: { name: string; path: string; isDirectory: boolean } | null) => void;
  refresh: () => void;
  toggleShowHidden: () => void;
  setSearchQuery: (query: string) => void;
  search: (pattern: string) => void;
  clearSearch: () => void;
  saveFile: (content: string) => Promise<void>;
}

/**
 * Hook for managing file browser state and operations.
 * Combines directory browsing, file selection, and search.
 */
export function useFileBrowser(initialPath?: string): UseFileBrowserResult {
  const queryClient = useQueryClient();
  const { error: showError, success: showSuccess } = useToastStore();

  // Core state - default to /home, will be updated when directory loads
  const [currentPath, setCurrentPath] = useState<string>(
    initialPath || '/home'
  );
  const [selectedFile, setSelectedFile] = useState<FileSystemEntry | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch directory contents
  const {
    data: directory,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['filesystem', 'browse', currentPath, showHidden],
    queryFn: async () => {
      return invoke<DirectoryContents>('browse_directory', {
        path: currentPath,
        show_hidden: showHidden,
      });
    },
    refetchOnWindowFocus: true,
  });

  // Fetch file content when a file is selected
  const {
    data: fileContent,
    isLoading: isLoadingFile,
  } = useQuery({
    queryKey: ['filesystem', 'file', selectedFile?.path],
    queryFn: async () => {
      if (!selectedFile || selectedFile.isDirectory) {
        return null;
      }
      return invoke<FileContent>('read_file_content', {
        path: selectedFile.path,
      });
    },
    enabled: !!selectedFile && !selectedFile.isDirectory,
  });

  // Fetch project context for current path
  const {
    data: projectContext,
    isLoading: isLoadingProjectContext,
  } = useQuery({
    queryKey: ['project-context', currentPath],
    queryFn: async () => {
      return invoke<ProjectPathInfo>('get_project_info_by_path', {
        path: currentPath,
      });
    },
    // Only fetch when we have a valid path
    enabled: !!currentPath,
  });

  // Update project status mutation
  const updateProjectStatusMutation = useMutation({
    mutationFn: async ({ projectName, status }: { projectName: string; status: string }) => {
      await invoke<void>('update_project_status', {
        project_name: projectName,
        status: status.toUpperCase(),
      });
    },
    onSuccess: () => {
      showSuccess('Project status updated');
      // Invalidate project context to refresh status
      queryClient.invalidateQueries({
        queryKey: ['project-context', currentPath],
      });
      // Also invalidate the projects list
      queryClient.invalidateQueries({
        queryKey: ['projects'],
      });
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Failed to update status');
    },
  });

  // Update project status helper function
  const updateProjectStatus = useCallback(async (status: string) => {
    if (!projectContext?.project?.name) {
      throw new Error('No project context available');
    }
    await updateProjectStatusMutation.mutateAsync({
      projectName: projectContext.project.name,
      status,
    });
  }, [projectContext?.project?.name, updateProjectStatusMutation]);

  // Save file mutation
  const saveMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      await invoke<void>('write_file_content', { path, content });
    },
    onSuccess: () => {
      showSuccess('File saved successfully');
      // Refresh file content
      if (selectedFile) {
        queryClient.invalidateQueries({
          queryKey: ['filesystem', 'file', selectedFile.path],
        });
      }
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Failed to save file');
    },
  });

  // Compute breadcrumbs from current path
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs: { name: string; path: string }[] = [
      { name: '/', path: '/' },
    ];

    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      crumbs.push({ name: part, path: accumulated });
    }

    return crumbs;
  }, [currentPath]);

  // Navigation
  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    setSelectedFile(null);
    setSearchResults(null);
    setSearchQuery('');
  }, []);

  const navigateUp = useCallback(() => {
    if (directory?.parent) {
      navigateTo(directory.parent);
    }
  }, [directory?.parent, navigateTo]);

  // File selection - accepts both FileSystemEntry and SearchResult
  const selectFile = useCallback((entry: { name: string; path: string; isDirectory: boolean } | null) => {
    if (entry?.isDirectory) {
      navigateTo(entry.path);
    } else if (entry) {
      // For search results, we create a minimal FileSystemEntry
      // The file content query will fetch full details
      const fileEntry: FileSystemEntry = {
        name: entry.name,
        path: entry.path,
        isDirectory: false,
        size: 'size' in entry ? (entry as FileSystemEntry).size : 0,
        lastModified: 'lastModified' in entry ? (entry as FileSystemEntry).lastModified : '',
        lastModifiedAgo: 'lastModifiedAgo' in entry ? (entry as FileSystemEntry).lastModifiedAgo : undefined,
        isHidden: 'isHidden' in entry ? (entry as FileSystemEntry).isHidden : entry.name.startsWith('.'),
        extension: 'extension' in entry ? (entry as FileSystemEntry).extension : entry.name.split('.').pop() || '',
      };
      setSelectedFile(fileEntry);
    } else {
      setSelectedFile(null);
    }
  }, [navigateTo]);

  // Refresh
  const refresh = useCallback(() => {
    refetch();
    if (selectedFile) {
      queryClient.invalidateQueries({
        queryKey: ['filesystem', 'file', selectedFile.path],
      });
    }
  }, [refetch, queryClient, selectedFile]);

  // Toggle hidden files
  const toggleShowHidden = useCallback(() => {
    setShowHidden((prev) => !prev);
  }, []);

  // Search
  const search = useCallback(async (pattern: string) => {
    if (!pattern.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const results = await invoke<SearchResult[]>('search_files', {
        root_path: currentPath,
        pattern: pattern.trim(),
        max_results: 50,
      });
      setSearchResults(results);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [currentPath, showError]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  // Save file
  const saveFile = useCallback(async (content: string) => {
    if (!selectedFile || selectedFile.isDirectory) {
      throw new Error('No file selected');
    }
    await saveMutation.mutateAsync({ path: selectedFile.path, content });
  }, [selectedFile, saveMutation]);

  return {
    currentPath,
    directory,
    isLoading,
    error: error as Error | null,
    selectedFile,
    fileContent: fileContent ?? null,
    isLoadingFile,
    searchQuery,
    searchResults,
    isSearching,
    showHidden,
    breadcrumbs,
    projectContext: projectContext ?? null,
    isLoadingProjectContext,
    updateProjectStatus,
    navigateTo,
    navigateUp,
    selectFile,
    refresh,
    toggleShowHidden,
    setSearchQuery,
    search,
    clearSearch,
    saveFile,
  };
}
