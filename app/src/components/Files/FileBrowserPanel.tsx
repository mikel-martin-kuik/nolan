import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { FileList } from './FileList';
import { FileViewer } from './FileViewer';
import { BreadcrumbNav } from './BreadcrumbNav';
import { useFileBrowser } from '@/hooks';
import { useFileBrowserStore } from '@/store/fileBrowserStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useToastStore } from '@/store/toastStore';
import { invoke } from '@/lib/api';
import { RefreshCw, Search, Eye, EyeOff, Home, Star, ChevronLeft, FolderOpen, Check, MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FileSystemEntry, SearchResult } from '@/types/filesystem';
import { PROJECT_STATUS_META, PROJECT_STATUS_OPTIONS, type ProjectStatus } from '@/types/projects';
import { getWorkflowSteps } from '@/types';
import { useTeamStore } from '@/store/teamStore';

export function FileBrowserPanel() {
  // Track the default home path (fetched from backend)
  const [defaultHomePath, setDefaultHomePath] = useState<string | null>(null);

  const {
    currentPath,
    directory,
    isLoading,
    error,
    selectedFile,
    fileContent,
    isLoadingFile,
    searchQuery,
    searchResults,
    isSearching,
    showHidden,
    breadcrumbs,
    projectContext,
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
  } = useFileBrowser(defaultHomePath || undefined);

  // Track status update loading state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Get team configs for workflow progress display
  const teamConfigs = useTeamStore(state => state.teamConfigs);
  const loadTeam = useTeamStore(state => state.loadTeam);

  // Load team config for current project if needed
  useEffect(() => {
    if (projectContext?.project?.team) {
      const teamName = projectContext.project.team;
      if (!teamConfigs.has(teamName)) {
        loadTeam(teamName).catch(console.error);
      }
    }
  }, [projectContext?.project?.team, teamConfigs, loadTeam]);

  // Get workflow steps for current project
  const workflowSteps = useMemo(() => {
    if (!projectContext?.project?.team) return [];
    const teamConfig = teamConfigs.get(projectContext.project.team);
    return getWorkflowSteps(teamConfig ?? null);
  }, [projectContext?.project?.team, teamConfigs]);

  // Calculate workflow step completion for project progress dots
  const stepCompletion = useMemo(() => {
    if (!projectContext?.project || workflowSteps.length === 0) return [];

    const project = projectContext.project;
    return workflowSteps.map(step => {
      // Special handling for "close" step - check project status
      if (step.key === 'close') {
        return { ...step, complete: project.status === 'complete' };
      }

      const fileKey = `${step.key}.md`;
      const completion = project.file_completions.find(f =>
        f.file === fileKey || f.file === step.key
      );

      if (completion) {
        return { ...step, complete: completion.exists && completion.completed };
      }

      // Fallback: check existing_files
      const exactMatch = project.existing_files.some(f =>
        f === fileKey || f === `${step.key}.md`
      );

      return { ...step, complete: exactMatch };
    });
  }, [workflowSteps, projectContext?.project]);

  const completedCount = stepCompletion.filter(s => s.complete).length;

  // Handle status change
  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (!projectContext?.project || newStatus === projectContext.project.status || isUpdatingStatus) return;

    setIsUpdatingStatus(true);
    try {
      await updateProjectStatus(newStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const { lastPath, addRecentPath, favorites, addFavorite, removeFavorite, isFavorite } = useFileBrowserStore();
  const { context, clearContext } = useNavigationStore();
  const { success: showSuccess, error: showError } = useToastStore();

  // Mobile: track whether to show file viewer (vs file list)
  const [showMobileViewer, setShowMobileViewer] = useState(false);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogType, setCreateDialogType] = useState<'file' | 'folder'>('file');
  const [createDialogName, setCreateDialogName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileSystemEntry | SearchResult | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileSystemEntry | SearchResult | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Fetch default home path on mount
  useEffect(() => {
    invoke<string | { path: string }>('get_file_browser_default_path')
      .then((result) => {
        // Handle both Tauri (string) and API (object) responses
        const path = typeof result === 'string' ? result : result.path;
        setDefaultHomePath(path);
      })
      .catch((err) => console.error('Failed to get default path:', err));
  }, []);

  // When a file is selected on mobile, show the viewer
  const handleFileSelect = (entry: Parameters<typeof selectFile>[0]) => {
    selectFile(entry);
    if (entry && !('entries' in entry)) {
      // It's a file, show viewer on mobile
      setShowMobileViewer(true);
    }
  };

  // Handle deep-linking from navigation context
  useEffect(() => {
    if (context.filePath) {
      navigateTo(context.filePath);
      clearContext();
    }
  }, [context.filePath, navigateTo, clearContext]);

  // Restore last path or navigate to default path on mount
  useEffect(() => {
    if (context.filePath) return; // Don't override context navigation
    if (lastPath) {
      navigateTo(lastPath);
    } else if (defaultHomePath) {
      navigateTo(defaultHomePath);
    }
  }, [defaultHomePath]); // Re-run when defaultHomePath is fetched

  // Track recent paths
  useEffect(() => {
    if (currentPath) {
      addRecentPath(currentPath);
    }
  }, [currentPath, addRecentPath]);

  // Handle search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      search(searchQuery);
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  };

  const toggleFavorite = () => {
    if (isFavorite(currentPath)) {
      removeFavorite(currentPath);
    } else {
      addFavorite(currentPath);
    }
  };

  // Default home path (use fetched path or fallback)
  const homePath = defaultHomePath || '/home';

  // File operations - open dialogs
  const handleCreateFile = useCallback(() => {
    setCreateDialogType('file');
    setCreateDialogName('');
    setCreateDialogOpen(true);
    setTimeout(() => createInputRef.current?.focus(), 100);
  }, []);

  const handleCreateFolder = useCallback(() => {
    setCreateDialogType('folder');
    setCreateDialogName('');
    setCreateDialogOpen(true);
    setTimeout(() => createInputRef.current?.focus(), 100);
  }, []);

  const handleDelete = useCallback((entry: FileSystemEntry | SearchResult) => {
    setDeleteTarget(entry);
    setDeleteDialogOpen(true);
  }, []);

  const handleRename = useCallback((entry: FileSystemEntry | SearchResult) => {
    setRenameTarget(entry);
    setRenameNewName(entry.name);
    setRenameDialogOpen(true);
    setTimeout(() => renameInputRef.current?.focus(), 100);
  }, []);

  // Dialog confirm actions
  const confirmCreate = useCallback(async () => {
    if (!createDialogName.trim()) return;

    try {
      const path = `${currentPath}/${createDialogName.trim()}`;
      if (createDialogType === 'file') {
        await invoke('create_file', { path });
        showSuccess(`Created file: ${createDialogName}`);
      } else {
        await invoke('create_directory', { path });
        showSuccess(`Created folder: ${createDialogName}`);
      }
      setCreateDialogOpen(false);
      refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to create ${createDialogType}`);
    }
  }, [createDialogName, createDialogType, currentPath, refresh, showSuccess, showError]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.isDirectory) {
        await invoke('delete_directory', { path: deleteTarget.path, recursive: true });
      } else {
        await invoke('delete_file', { path: deleteTarget.path });
      }
      showSuccess(`Deleted: ${deleteTarget.name}`);
      if (selectedFile?.path === deleteTarget.path) {
        selectFile(null);
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }, [deleteTarget, refresh, selectedFile, selectFile, showSuccess, showError]);

  const confirmRename = useCallback(async () => {
    if (!renameTarget || !renameNewName.trim() || renameNewName === renameTarget.name) return;

    const parentPath = renameTarget.path.substring(0, renameTarget.path.lastIndexOf('/'));
    const newPath = `${parentPath}/${renameNewName.trim()}`;

    try {
      await invoke('rename_file', { old_path: renameTarget.path, new_path: newPath });
      showSuccess(`Renamed to: ${renameNewName}`);
      setRenameDialogOpen(false);
      setRenameTarget(null);
      refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to rename');
    }
  }, [renameTarget, renameNewName, refresh, showSuccess, showError]);

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-3">
      {/* Top Header - Icons and Path */}
      <div className="glass-card p-2 sm:p-3 rounded-lg flex items-center gap-2 flex-wrap">
        {/* Mobile back button */}
        <div className={cn("md:hidden", !showMobileViewer && "hidden")}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMobileViewer(false)}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        {/* Navigation controls */}
        <div className={cn("flex items-center gap-1", showMobileViewer && "hidden md:flex")}>
          {/* Home button */}
          <Tooltip content="Go to home directory">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigateTo(homePath)}
            >
              <Home className="w-4 h-4" />
            </Button>
          </Tooltip>

          {/* Favorite button */}
          <Tooltip content={isFavorite(currentPath) ? 'Remove from favorites' : 'Add to favorites'}>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', isFavorite(currentPath) && 'text-yellow-500')}
              onClick={toggleFavorite}
            >
              <Star className={cn('w-4 h-4', isFavorite(currentPath) && 'fill-current')} />
            </Button>
          </Tooltip>

          {/* Show hidden toggle */}
          <Tooltip content={showHidden ? 'Hide hidden files' : 'Show hidden files'}>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', showHidden && 'text-primary')}
              onClick={toggleShowHidden}
            >
              {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          </Tooltip>

          {/* Refresh */}
          <Tooltip content="Refresh">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </Tooltip>
        </div>

        {/* Divider */}
        <div className={cn("w-px h-6 bg-border", showMobileViewer && "hidden md:block")} />

        {/* Breadcrumb navigation - takes remaining space */}
        <div className={cn("flex-1 min-w-0", showMobileViewer && "hidden md:block")}>
          <BreadcrumbNav
            breadcrumbs={breadcrumbs}
            onNavigate={navigateTo}
          />
        </div>
      </div>

      {/* Project Context Bar - shown when browsing inside a project */}
      {projectContext?.project && (
        <div className={cn(
          "glass-card p-2 sm:p-3 rounded-lg flex items-center gap-3 flex-wrap",
          showMobileViewer && "hidden md:flex"
        )}>
          {/* Project icon and name */}
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-sm">{projectContext.project.name}</span>
            <span className="text-xs text-muted-foreground">({projectContext.project.team})</span>
          </div>

          {/* Workflow progress dots */}
          {stepCompletion.length > 0 && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1">
                {stepCompletion.map((step) => (
                  <Tooltip key={step.key} content={step.label ?? step.key}>
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-colors",
                        step.complete ? "bg-primary" : "bg-muted-foreground/20"
                      )}
                    />
                  </Tooltip>
                ))}
                <span className="text-[11px] text-muted-foreground ml-1.5">
                  {completedCount}/{workflowSteps.length}
                </span>
              </div>
            </>
          )}

          {/* Status badge and dropdown */}
          <div className="flex items-center gap-2 ml-auto">
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              PROJECT_STATUS_META[projectContext.project.status].color,
              "bg-foreground/5"
            )}>
              {PROJECT_STATUS_META[projectContext.project.status].label}
            </span>

            {/* Status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isUpdatingStatus}
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {PROJECT_STATUS_OPTIONS.map((status) => {
                  const statusMeta = PROJECT_STATUS_META[status];
                  return (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className={cn("flex items-center justify-between cursor-pointer", statusMeta.color)}
                    >
                      {statusMeta.label}
                      {status === projectContext.project?.status && <Check className="w-3.5 h-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Projects directory quick nav - shown when at projects root */}
      {projectContext?.is_projects_root && (
        <div className={cn(
          "glass-card p-2 sm:p-3 rounded-lg flex items-center gap-2",
          showMobileViewer && "hidden md:flex"
        )}>
          <FolderOpen className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">Projects Directory</span>
          <span className="text-xs text-muted-foreground">- Select a project folder to see its status</span>
        </div>
      )}

      {/* Main Content - File List and Viewer side by side */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden gap-2 sm:gap-3 min-h-0">
        {/* Left: File List */}
        <div className={cn(
          "flex flex-col overflow-hidden glass-card p-2 sm:p-3 rounded-lg",
          // Desktop: fixed width sidebar
          "md:w-[320px] md:flex-shrink-0",
          // Mobile: full width, hide when viewing file
          "w-full",
          showMobileViewer && "hidden md:flex"
        )}>
          {/* Search input */}
          <div className="relative mb-2 sm:mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={clearSearch}
              >
                ×
              </button>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-auto">
            <FileList
              entries={searchResults || directory?.entries || []}
              isLoading={isLoading || isSearching}
              error={error ? String(error) : null}
              selectedPath={selectedFile?.path || null}
              onSelect={handleFileSelect}
              onNavigateUp={navigateUp}
              hasParent={!!directory?.parent}
              isSearchResults={!!searchResults}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          </div>

          {/* Favorites quick access */}
          {favorites.length > 0 && !searchResults && (
            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Favorites</div>
              <div className="flex flex-wrap gap-1">
                {favorites.slice(0, 5).map((path) => (
                  <button
                    key={path}
                    onClick={() => navigateTo(path)}
                    className={cn(
                      'text-xs px-2 py-1 rounded bg-foreground/5 hover:bg-foreground/10 truncate max-w-[100px]',
                      currentPath === path && 'bg-foreground/10'
                    )}
                    title={path}
                  >
                    {path.split('/').pop() || '/'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: File Viewer */}
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden glass-card rounded-lg",
          // Mobile: full width, hide when not viewing file
          !showMobileViewer && "hidden md:flex"
        )}>
          <FileViewer
            file={selectedFile}
            content={fileContent}
            isLoading={isLoadingFile}
            onSave={saveFile}
          />
        </div>
      </div>

      {/* Create File/Folder Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createDialogType === 'file' ? 'Create New File' : 'Create New Folder'}
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new {createDialogType}.
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={createInputRef}
            value={createDialogName}
            onChange={(e) => setCreateDialogName(e.target.value)}
            placeholder={createDialogType === 'file' ? 'filename.txt' : 'folder-name'}
            onKeyDown={(e) => e.key === 'Enter' && confirmCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmCreate} disabled={!createDialogName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.isDirectory ? 'Folder' : 'File'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isDirectory
                ? `Are you sure you want to delete the folder "${deleteTarget?.name}" and all its contents? This action cannot be undone.`
                : `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name for "{renameTarget?.name}".
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={renameInputRef}
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            placeholder="New name"
            onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRename}
              disabled={!renameNewName.trim() || renameNewName === renameTarget?.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
