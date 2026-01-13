import { RefreshCw, Folder, FileText, FileCode, FileJson, File, Image, ChevronUp, Trash2, FilePlus, FolderPlus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileSystemEntry, SearchResult } from '@/types/filesystem';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

type ListEntry = FileSystemEntry | SearchResult;

interface FileListProps {
  entries: ListEntry[];
  isLoading: boolean;
  error: string | null;
  selectedPath: string | null;
  onSelect: (entry: ListEntry) => void;
  onNavigateUp: () => void;
  hasParent: boolean;
  isSearchResults?: boolean;
  onCreateFile?: () => void;
  onCreateFolder?: () => void;
  onDelete?: (entry: ListEntry) => void;
  onRename?: (entry: ListEntry) => void;
}

function getFileIcon(entry: ListEntry) {
  if (entry.isDirectory) {
    return Folder;
  }

  // Get extension from name if not available on entry
  const ext = ('extension' in entry && entry.extension)
    ? entry.extension.toLowerCase()
    : entry.name.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'md':
    case 'txt':
      return FileText;
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'rs':
    case 'go':
    case 'rb':
    case 'sh':
      return FileCode;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return FileJson;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return Image;
    default:
      return File;
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({
  entries,
  isLoading,
  error,
  selectedPath,
  onSelect,
  onNavigateUp,
  hasParent,
  isSearchResults,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
}: FileListProps) {
  if (isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <Folder className="w-8 h-8 mb-2 opacity-50" />
        {isSearchResults ? 'No matching files found' : 'Empty directory'}
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="space-y-0.5 h-full flex flex-col">
          {/* Navigate up */}
          {hasParent && !isSearchResults && (
            <button
              onClick={onNavigateUp}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
              <span className="text-sm">..</span>
            </button>
          )}

          {/* File entries */}
          {entries.map((entry) => {
            const Icon = getFileIcon(entry);
            const isSelected = selectedPath === entry.path;
            const isHidden = 'isHidden' in entry ? entry.isHidden : false;
            const size = 'size' in entry ? entry.size : 0;
            const lastModifiedAgo = 'lastModifiedAgo' in entry ? entry.lastModifiedAgo : undefined;

            return (
              <ContextMenu key={entry.path}>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={() => onSelect(entry)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left',
                      isSelected
                        ? 'bg-foreground/10 text-foreground'
                        : 'hover:bg-foreground/5 text-foreground/80 hover:text-foreground'
                    )}
                  >
                    <Icon className={cn(
                      'w-4 h-4 flex-shrink-0',
                      entry.isDirectory ? 'text-blue-500' : 'text-muted-foreground'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate">{entry.name}</span>
                        {isHidden && (
                          <span className="text-[10px] text-muted-foreground">(hidden)</span>
                        )}
                      </div>
                      {isSearchResults && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {entry.path}
                        </div>
                      )}
                    </div>
                    {!entry.isDirectory && size > 0 && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatSize(size)}
                      </span>
                    )}
                    {lastModifiedAgo && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {lastModifiedAgo}
                      </span>
                    )}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {onRename && (
                    <ContextMenuItem onClick={() => onRename(entry)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Rename
                    </ContextMenuItem>
                  )}
                  {onDelete && (
                    <ContextMenuItem
                      onClick={() => onDelete(entry)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {/* Empty space area to catch right-clicks for create menu */}
          <div className="flex-1 min-h-[60px]" />
        </div>
      </ContextMenuTrigger>
      {/* Context menu for empty area */}
      <ContextMenuContent>
        {onCreateFile && (
          <ContextMenuItem onClick={onCreateFile}>
            <FilePlus className="w-4 h-4 mr-2" />
            New File
          </ContextMenuItem>
        )}
        {onCreateFolder && (
          <ContextMenuItem onClick={onCreateFolder}>
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
