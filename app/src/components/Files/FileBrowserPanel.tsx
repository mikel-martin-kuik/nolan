import { useEffect } from 'react';
import { FileList } from './FileList';
import { FileViewer } from './FileViewer';
import { BreadcrumbNav } from './BreadcrumbNav';
import { useFileBrowser } from '@/hooks';
import { useFileBrowserStore } from '@/store/fileBrowserStore';
import { useNavigationStore } from '@/store/navigationStore';
import { RefreshCw, Search, Eye, EyeOff, Home, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function FileBrowserPanel() {
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
    navigateTo,
    navigateUp,
    selectFile,
    refresh,
    toggleShowHidden,
    setSearchQuery,
    search,
    clearSearch,
    saveFile,
  } = useFileBrowser();

  const { lastPath, addRecentPath, favorites, addFavorite, removeFavorite, isFavorite } = useFileBrowserStore();
  const { context, clearContext } = useNavigationStore();

  // Handle deep-linking from navigation context
  useEffect(() => {
    if (context.filePath) {
      navigateTo(context.filePath);
      clearContext();
    }
  }, [context.filePath, navigateTo, clearContext]);

  // Restore last path on mount
  useEffect(() => {
    if (lastPath && !context.filePath) {
      navigateTo(lastPath);
    }
  }, []); // Only on mount

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

  // Default home path
  const homePath = '/home';

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden gap-4 min-h-0">
        {/* Left: File List */}
        <div className="w-[360px] flex flex-col overflow-hidden flex-shrink-0 glass-card p-3 rounded-lg">
          {/* Header with controls */}
          <div className="flex items-center gap-2 mb-3">
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

          {/* Breadcrumb navigation */}
          <BreadcrumbNav
            breadcrumbs={breadcrumbs}
            onNavigate={navigateTo}
          />

          {/* Search input */}
          <div className="relative mb-3">
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
              onSelect={selectFile}
              onNavigateUp={navigateUp}
              hasParent={!!directory?.parent}
              isSearchResults={!!searchResults}
            />
          </div>

          {/* Favorites quick access */}
          {favorites.length > 0 && !searchResults && (
            <div className="mt-3 pt-3 border-t border-border">
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <FileViewer
            file={selectedFile}
            content={fileContent}
            isLoading={isLoadingFile}
            onSave={saveFile}
          />
        </div>
      </div>
    </div>
  );
}
