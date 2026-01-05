import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { FileText, RefreshCw, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

// File type metadata - minimal
const FILE_META: Record<string, { owner: string; label: string }> = {
  'context': { owner: 'PO', label: 'Context' },
  'NOTES': { owner: 'Dan', label: 'Notes' },
  'research': { owner: 'Ana', label: 'Research' },
  'plan': { owner: 'Bill', label: 'Plan' },
  'qa-review': { owner: 'Enzo', label: 'QA' },
  'progress': { owner: 'Carl', label: 'Progress' },
};

interface ProjectFileViewerProps {
  project: string | null;
  file: string | null;
}

export function ProjectFileViewer({ project, file }: ProjectFileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine file type from filename
  const fileType = useMemo(() => {
    if (!file) return null;
    const name = file.replace('.md', '');
    return Object.keys(FILE_META).find(key => name.includes(key)) || null;
  }, [file]);

  const meta = fileType ? FILE_META[fileType] : null;

  const loadFile = async () => {
    if (!project || !file) return;

    setLoading(true);
    setError(null);
    try {
      const fileContent = await invoke<string>('read_project_file', {
        projectName: project,
        filePath: file
      });
      setContent(fileContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFile();
  }, [project, file]);

  return (
    <div className="glass-card rounded-xl h-full flex flex-col">
      {/* Minimal Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {project && file ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-muted-foreground truncate">{project}</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-sm font-medium text-foreground truncate">{file}</span>
                {meta && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    ({meta.owner})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Select a file</span>
            )}
          </div>
          {project && file && (
            <button
              onClick={loadFile}
              disabled={loading}
              className="p-1.5 hover:bg-accent rounded transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
            </button>
          )}
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
                onClick={loadFile}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!project && !file && !loading && !error && (
          <div className="flex items-center justify-center py-16 px-4">
            <div className="text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a document to view</p>
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
