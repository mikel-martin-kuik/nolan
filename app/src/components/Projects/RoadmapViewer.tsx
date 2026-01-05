import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { Compass, RefreshCw, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoadmapViewerProps {
  onBack?: () => void;
}

export function RoadmapViewer({ onBack }: RoadmapViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoadmap = async () => {
    setLoading(true);
    setError(null);
    try {
      const roadmapContent = await invoke<string>('read_roadmap');
      setContent(roadmapContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Extract current version from content
  const currentVersion = useMemo(() => {
    const match = content.match(/Current State \((v[\d.]+)\)/);
    return match ? match[1] : 'v0.x';
  }, [content]);

  useEffect(() => {
    loadRoadmap();
  }, []);

  return (
    <div className="glass-card rounded-xl h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-accent rounded transition-colors -ml-1"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <Compass className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Roadmap</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
              {currentVersion}
            </span>
          </div>
          <button
            onClick={loadRoadmap}
            disabled={loading}
            className="p-1.5 hover:bg-accent rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-16 px-4">
            <div className="text-center max-w-sm">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button
                onClick={loadRoadmap}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {content && !loading && !error && (
          <div className="p-6 prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-sm">
            <MessageRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
