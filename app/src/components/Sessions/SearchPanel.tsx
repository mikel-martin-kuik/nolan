import { useState, useEffect } from 'react';
import { useSearch } from '@/hooks/useSessions';
import { SearchMatch } from '@/types/sessions';

interface SearchPanelProps {
  onResultClick: (sessionId: string, messageIndex: number) => void;
}

export function SearchPanel({ onResultClick }: SearchPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: results, isLoading, error } = useSearch(debouncedQuery);

  const handleResultClick = (match: SearchMatch) => {
    onResultClick(match.session_id, match.message_index);
  };

  return (
    <div className="bg-card/50 backdrop-blur-xl rounded-2xl border border-border shadow-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search messages..."
          className="flex-1 px-4 py-2.5 border border-border rounded-xl bg-secondary/50 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
        />
        {isLoading && (
          <div className="text-sm text-muted-foreground">Searching...</div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">
          Search error: {error.message}
        </div>
      )}

      {results && results.total_matches > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground mb-2">
            {results.total_matches} match{results.total_matches !== 1 ? 'es' : ''} found
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {results?.matches?.map((match, index) => (
              <div
                key={`${match.session_id}-${index}`}
                onClick={() => handleResultClick(match)}
                className="p-3 border border-border rounded-xl hover:bg-accent cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="font-medium text-sm text-foreground">
                    {match.session_summary}
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    {match.message_type}
                  </span>
                </div>
                <div className="text-sm text-foreground/80 line-clamp-2">
                  {match.excerpt}
                </div>
                {match.timestamp && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(match.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results && results.total_matches === 0 && debouncedQuery && (
        <div className="text-sm text-muted-foreground">
          No matches found for "{debouncedQuery}"
        </div>
      )}

      {!debouncedQuery && (
        <div className="text-sm text-muted-foreground">
          Enter at least 2 characters to search
        </div>
      )}
    </div>
  );
}
