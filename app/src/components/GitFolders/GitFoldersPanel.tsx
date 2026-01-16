import { useEffect, useState } from 'react';
import { useGitFoldersStore } from '@/store/gitFoldersStore';
import { useToastStore } from '@/store/toastStore';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Plus,
  GitBranch,
  Folder,
  MoreHorizontal,
  Trash2,
  Edit,
  FolderSync,
  Copy,
  Loader2,
  Search,
  FolderInput,
} from 'lucide-react';
import type { GitFolderWithWorktrees } from '@/types/git-folders';

export function GitFoldersPanel() {
  const {
    folders,
    isLoading,
    error,
    cloneDialogOpen,
    loadFolders,
    cloneRepository,
    fetchFolder,
    removeFolder,
    updateFolder,
    scanDirectory,
    setCloneDialogOpen,
  } = useGitFoldersStore();

  const { success: showSuccess, error: showError } = useToastStore();

  // Clone dialog state
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Scan dialog state
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanPath, setScanPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GitFolderWithWorktrees | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<GitFolderWithWorktrees | null>(null);
  const [renameNewName, setRenameNewName] = useState('');

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Clone handler
  const handleClone = async () => {
    if (!cloneUrl.trim()) return;

    setIsCloning(true);
    const result = await cloneRepository(cloneUrl.trim(), cloneName.trim() || undefined);
    setIsCloning(false);

    if (result.success) {
      showSuccess(`Cloned repository: ${result.folder?.name}`);
      setCloneDialogOpen(false);
      setCloneUrl('');
      setCloneName('');
    } else {
      showError(result.error || 'Clone failed');
    }
  };

  // Scan handler
  const handleScan = async () => {
    if (!scanPath.trim()) return;

    setIsScanning(true);
    await scanDirectory(scanPath.trim());
    setIsScanning(false);
    setScanDialogOpen(false);
    setScanPath('');
  };

  // Fetch handler
  const handleFetch = async (folder: GitFolderWithWorktrees) => {
    try {
      await fetchFolder(folder.id);
      showSuccess(`Fetched updates for ${folder.name}`);
    } catch (err) {
      showError(String(err));
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await removeFolder(deleteTarget.id, deleteFiles);
      showSuccess(`Removed ${deleteTarget.name}`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteFiles(false);
    } catch (err) {
      showError(String(err));
    }
  };

  // Rename handler
  const handleRename = async () => {
    if (!renameTarget || !renameNewName.trim()) return;

    try {
      await updateFolder(renameTarget.id, renameNewName.trim());
      showSuccess(`Renamed to ${renameNewName}`);
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setRenameNewName('');
    } catch (err) {
      showError(String(err));
    }
  };

  // Copy path to clipboard
  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    showSuccess('Copied path to clipboard');
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header */}
      <div className="glass-card p-3 rounded-lg flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold flex-1">Git Folders</h2>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Tooltip content="Scan directory for repositories">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScanDialogOpen(true)}
            >
              <Search className="w-4 h-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Clone repository">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCloneDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Refresh">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => loadFolders()}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="glass-card p-3 rounded-lg border-destructive/50 bg-destructive/10">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Folders list */}
      <div className="flex-1 overflow-auto">
        {isLoading && folders.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : folders.length === 0 ? (
          <div className="glass-card p-6 rounded-lg text-center">
            <Folder className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-3">No git folders yet</p>
            <Button onClick={() => setCloneDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Clone Repository
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => (
              <GitFolderCard
                key={folder.id}
                folder={folder}
                onFetch={() => handleFetch(folder)}
                onDelete={() => {
                  setDeleteTarget(folder);
                  setDeleteDialogOpen(true);
                }}
                onRename={() => {
                  setRenameTarget(folder);
                  setRenameNewName(folder.name);
                  setRenameDialogOpen(true);
                }}
                onCopyPath={() => handleCopyPath(folder.local_path)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Repository</DialogTitle>
            <DialogDescription>
              Enter the URL of a git repository to clone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Repository URL</label>
              <Input
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                onKeyDown={(e) => e.key === 'Enter' && handleClone()}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Name (optional)</label>
              <Input
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Custom folder name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={!cloneUrl.trim() || isCloning}>
              {isCloning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cloning...
                </>
              ) : (
                'Clone'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan for Repositories</DialogTitle>
            <DialogDescription>
              Enter a directory path to scan for git repositories.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1 block">Directory Path</label>
            <Input
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              placeholder="/home/user/projects"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScan} disabled={!scanPath.trim() || isScanning}>
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                'Scan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Git Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="deleteFiles"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="deleteFiles" className="text-sm">
              Also delete files from disk
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new display name for this git folder.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            placeholder="New name"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
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

// Individual folder card component
interface GitFolderCardProps {
  folder: GitFolderWithWorktrees;
  onFetch: () => void;
  onDelete: () => void;
  onRename: () => void;
  onCopyPath: () => void;
}

function GitFolderCard({ folder, onFetch, onDelete, onRename, onCopyPath }: GitFolderCardProps) {
  const statusColors = {
    ready: 'text-green-500',
    cloning: 'text-yellow-500',
    clone_failed: 'text-red-500',
    removed: 'text-gray-500',
  };

  return (
    <div className="glass-card p-3 rounded-lg">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1">
          <Folder className={cn('w-5 h-5', statusColors[folder.status])} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{folder.name}</h3>
            {folder.status !== 'ready' && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  folder.status === 'cloning' && 'bg-yellow-500/10 text-yellow-500',
                  folder.status === 'clone_failed' && 'bg-red-500/10 text-red-500',
                  folder.status === 'removed' && 'bg-gray-500/10 text-gray-500'
                )}
              >
                {folder.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <GitBranch className="w-3 h-3" />
            <span>{folder.current_branch}</span>
          </div>

          <p className="text-xs text-muted-foreground mt-1 truncate" title={folder.local_path}>
            {folder.local_path}
          </p>

          {/* Worktrees */}
          {folder.worktrees.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-1">
                Active worktrees ({folder.worktrees.length})
              </p>
              <div className="space-y-1">
                {folder.worktrees.slice(0, 3).map((wt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FolderInput className="w-3 h-3 text-blue-500" />
                    <span className="truncate">{wt.branch}</span>
                  </div>
                ))}
                {folder.worktrees.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{folder.worktrees.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {folder.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {folder.tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onFetch}>
              <FolderSync className="w-4 h-4 mr-2" />
              Fetch Updates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyPath}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Edit className="w-4 h-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
