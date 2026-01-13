import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FileBrowserSettings {
  /** Favorite paths for quick access */
  favorites: string[];
  /** Recently visited paths */
  recentPaths: string[];
  /** Last visited path */
  lastPath: string | null;
  /** Whether to show hidden files by default */
  showHiddenByDefault: boolean;
  /** Expanded directories in tree view */
  expandedDirs: string[];
}

interface FileBrowserStore extends FileBrowserSettings {
  // Actions
  addFavorite: (path: string) => void;
  removeFavorite: (path: string) => void;
  isFavorite: (path: string) => boolean;
  addRecentPath: (path: string) => void;
  clearRecentPaths: () => void;
  setLastPath: (path: string) => void;
  setShowHiddenByDefault: (show: boolean) => void;
  toggleDirExpanded: (path: string) => void;
  setDirExpanded: (path: string, expanded: boolean) => void;
  isDirExpanded: (path: string) => boolean;
}

const MAX_RECENT_PATHS = 10;

export const useFileBrowserStore = create<FileBrowserStore>()(
  persist(
    (set, get) => ({
      // Initial state
      favorites: [],
      recentPaths: [],
      lastPath: null,
      showHiddenByDefault: false,
      expandedDirs: [],

      // Favorites
      addFavorite: (path) => {
        set((state) => {
          if (state.favorites.includes(path)) {
            return state;
          }
          return { favorites: [...state.favorites, path] };
        });
      },

      removeFavorite: (path) => {
        set((state) => ({
          favorites: state.favorites.filter((p) => p !== path),
        }));
      },

      isFavorite: (path) => {
        return get().favorites.includes(path);
      },

      // Recent paths
      addRecentPath: (path) => {
        set((state) => {
          const filtered = state.recentPaths.filter((p) => p !== path);
          const updated = [path, ...filtered].slice(0, MAX_RECENT_PATHS);
          return { recentPaths: updated, lastPath: path };
        });
      },

      clearRecentPaths: () => {
        set({ recentPaths: [] });
      },

      // Last path
      setLastPath: (path) => {
        set({ lastPath: path });
      },

      // Hidden files
      setShowHiddenByDefault: (show) => {
        set({ showHiddenByDefault: show });
      },

      // Directory expansion
      toggleDirExpanded: (path) => {
        set((state) => {
          const expanded = state.expandedDirs.includes(path);
          if (expanded) {
            return { expandedDirs: state.expandedDirs.filter((p) => p !== path) };
          } else {
            return { expandedDirs: [...state.expandedDirs, path] };
          }
        });
      },

      setDirExpanded: (path, expanded) => {
        set((state) => {
          const isExpanded = state.expandedDirs.includes(path);
          if (expanded && !isExpanded) {
            return { expandedDirs: [...state.expandedDirs, path] };
          } else if (!expanded && isExpanded) {
            return { expandedDirs: state.expandedDirs.filter((p) => p !== path) };
          }
          return state;
        });
      },

      isDirExpanded: (path) => {
        return get().expandedDirs.includes(path);
      },
    }),
    {
      name: 'nolan-file-browser',
      // Only persist these fields
      partialize: (state) => ({
        favorites: state.favorites,
        recentPaths: state.recentPaths,
        lastPath: state.lastPath,
        showHiddenByDefault: state.showHiddenByDefault,
        // Don't persist expandedDirs - reset on page load
      }),
    }
  )
);
