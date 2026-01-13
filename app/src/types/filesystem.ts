/** A single entry in a directory listing (file or subdirectory) */
export interface FileSystemEntry {
  /** File or directory name */
  name: string;
  /** Full path to the entry */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Last modified time as ISO 8601 string */
  lastModified: string;
  /** Human-readable time ago string */
  lastModifiedAgo?: string;
  /** Whether this is a hidden file (starts with .) */
  isHidden: boolean;
  /** File extension (empty for directories) */
  extension: string;
}

/** Result of browsing a directory */
export interface DirectoryContents {
  /** Current path being browsed */
  currentPath: string;
  /** Parent directory path (null if at root) */
  parent?: string;
  /** Directory name */
  name: string;
  /** List of entries (files and subdirectories) */
  entries: FileSystemEntry[];
  /** Total number of entries */
  totalCount: number;
}

/** File content result */
export interface FileContent {
  /** Full path to the file */
  path: string;
  /** File content as string (for text files) */
  content: string;
  /** File size in bytes */
  size: number;
  /** MIME type hint based on extension */
  mimeType: string;
  /** Whether file is editable (text-based) */
  isEditable: boolean;
}

/** Search result entry */
export interface SearchResult {
  /** File/directory name */
  name: string;
  /** Full path */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Relative path from search root */
  relativePath: string;
}

/** View type for the file browser */
export type FileBrowserView = 'tree' | 'list';

/** Sort options for file browser */
export type FileBrowserSort = 'name' | 'date' | 'size' | 'type';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';
