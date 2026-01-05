import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { FileText, RefreshCw } from 'lucide-react';

interface ProjectFileViewerProps {
  project: string | null;
  file: string | null;
}

export function ProjectFileViewer({ project, file }: ProjectFileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl shadow-xl h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {project && file ? (
              <div className="text-sm">
                <span className="text-muted-foreground">{project}</span>
                <span className="text-muted-foreground mx-2">/</span>
                <span className="text-foreground font-medium">{file}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">No file selected</span>
            )}
          </div>
          {project && file && (
            <button
              onClick={loadFile}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              title="Refresh file"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="text-center text-muted-foreground py-8">
            Loading file...
          </div>
        )}
        {error && (
          <div className="text-center text-red-500 py-8">
            Error: {error}
          </div>
        )}
        {!project && !file && !loading && !error && (
          <div className="text-center text-muted-foreground py-8">
            Select a file to view
          </div>
        )}
        {content && !loading && !error && (
          <MessageRenderer content={content} />
        )}
      </div>
    </div>
  );
}
