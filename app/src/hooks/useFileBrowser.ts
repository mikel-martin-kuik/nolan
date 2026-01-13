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
        showHidden,
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
        rootPath: currentPath,
        pattern: pattern.trim(),
        maxResults: 50,
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
