import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@/lib/api';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { FileText, RefreshCw, FolderOpen, Pencil, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileMarkerCheckbox } from './FileMarkerCheckbox';
import { FileCompletion } from '@/types/projects';

// File type metadata - minimal fallback for display purposes
// Note: Actual workflow files and owners are determined by team config
// This is only used for display hints when team config is not available
const FILE_META: Record<string, { owner: string; label: string }> = {
  'prompt': { owner: 'PO', label: 'Prompt' },
};

interface ProjectFileViewerProps {
  project: string | null;
  file: string | null;
  isWorkflowFile?: boolean;
  fileCompletion?: FileCompletion | null;
}

export function ProjectFileViewer({ project, file, isWorkflowFile, fileCompletion }: ProjectFileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState<string>('');
  const [saving, setSaving] = useState(false);

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
      const result = await invoke<string | { content: string }>('read_project_file', {
        projectName: project,
        filePath: file
      });
      const fileContent = typeof result === 'string' ? result : result?.content ?? '';
      setContent(fileContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFile();
    setIsEditing(false); // Reset edit mode when file changes
  }, [project, file]);

  const handleEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleSave = async () => {
    if (!project || !file) return;

    setSaving(true);
    setError(null);
    try {
      await invoke('write_project_file', {
        projectName: project,
        filePath: file,
        content: editContent
      });
      setContent(editContent);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancel}
                    disabled={saving}
                    title="Cancel"
                    className="h-7 w-7"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSave}
                    disabled={saving}
                    title="Save"
                    className="h-7 w-7 text-green-500 hover:text-green-500"
                  >
                    <Save className={cn("w-3.5 h-3.5", saving && "animate-pulse")} />
                  </Button>
                </>
              ) : (
                <>
                  {/* Mark as done button - only for workflow files */}
                  {isWorkflowFile && (
                    <FileMarkerCheckbox
                      projectName={project}
                      filePath={file}
                      isCompleted={fileCompletion?.completed ?? false}
                      completedBy={fileCompletion?.completed_by}
                      completedAt={fileCompletion?.completed_at}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEdit}
                    disabled={loading || !content}
                    title="Edit"
                    className="h-7 w-7"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={loadFile}
                    disabled={loading}
                    title="Refresh"
                    className="h-7 w-7"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                  </Button>
                </>
              )}
            </div>
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
              <Button size="sm" onClick={loadFile}>
                Retry
              </Button>
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
          isEditing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full p-6 bg-transparent font-mono text-sm rounded-none border-none focus:ring-0"
              spellCheck={false}
            />
          ) : (
            <div className="p-6 prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-sm">
              <MessageRenderer content={content} />
            </div>
          )
        )}
      </div>
    </div>
  );
}
