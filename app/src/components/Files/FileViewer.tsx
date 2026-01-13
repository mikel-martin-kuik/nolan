import { useState, useEffect } from 'react';
import { RefreshCw, Save, X, Pencil, FileText, File, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { MessageRenderer } from '@/components/Sessions/MessageRenderer';
import { useToastStore } from '@/store/toastStore';
import type { FileSystemEntry, FileContent } from '@/types/filesystem';

interface FileViewerProps {
  file: FileSystemEntry | null;
  content: FileContent | null;
  isLoading: boolean;
  onSave: (content: string) => Promise<void>;
}

export function FileViewer({ file, content, isLoading, onSave }: FileViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { success: showSuccess, error: showError } = useToastStore();

  // Reset edit state when file changes
  useEffect(() => {
    setIsEditing(false);
    setEditedContent('');
  }, [file?.path]);

  // Start editing
  const handleEdit = () => {
    if (content?.content) {
      setEditedContent(content.content);
      setIsEditing(true);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent('');
  };

  // Save changes
  const handleSave = async () => {
    if (!file) return;

    setIsSaving(true);
    try {
      await onSave(editedContent);
      setIsEditing(false);
      setEditedContent('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy path to clipboard
  const handleCopyPath = () => {
    if (file) {
      navigator.clipboard.writeText(file.path);
      showSuccess('Path copied to clipboard');
    }
  };

  // No file selected
  if (!file) {
    return (
      <div className="h-full glass-card rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a file to view</p>
        </div>
      </div>
    );
  }

  // Directory selected (shouldn't happen but handle it)
  if (file.isDirectory) {
    return (
      <div className="h-full glass-card rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">This is a directory</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full glass-card rounded-lg flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine file type and rendering
  const isMarkdown = file.extension === 'md';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(file.extension.toLowerCase());
  const isPdf = file.extension.toLowerCase() === 'pdf';
  const isText = content?.mimeType.startsWith('text/') || content?.mimeType === 'application/json';

  return (
    <div className="h-full glass-card rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{file.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{file.path}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Copy path */}
          <Tooltip content="Copy path">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopyPath}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>

          {/* Edit / Save / Cancel */}
          {content?.isEditable && (
            <>
              {isEditing ? (
                <>
                  <Tooltip content="Save changes">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-green-500"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </Tooltip>
                  <Tooltip content="Cancel">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                </>
              ) : (
                <Tooltip content="Edit file">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleEdit}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Editing mode */}
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-full min-h-[400px] font-mono text-sm resize-none"
            autoFocus
          />
        ) : isImage ? (
          /* Image preview */
          <div className="flex items-center justify-center h-full">
            <img
              src={`data:image/${file.extension};base64,${content?.content || ''}`}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                // Fallback for images that can't be displayed
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement?.insertAdjacentHTML(
                  'beforeend',
                  '<div class="text-muted-foreground text-sm">Unable to display image</div>'
                );
              }}
            />
          </div>
        ) : isPdf ? (
          /* PDF notice */
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <File className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm mb-4">PDF preview not available</p>
            <Button variant="outline" size="sm" onClick={() => window.open(file.path)}>
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Open in system viewer
            </Button>
          </div>
        ) : isMarkdown && content?.content ? (
          /* Markdown rendered */
          <MessageRenderer content={content.content} />
        ) : isText && content?.content ? (
          /* Plain text / code */
          <pre className="font-mono text-sm whitespace-pre-wrap break-words">
            {content.content}
          </pre>
        ) : (
          /* Binary / unsupported */
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <File className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Binary file - preview not available</p>
            <p className="text-xs mt-1">{content?.mimeType || 'unknown type'}</p>
          </div>
        )}
      </div>

      {/* Footer with file info */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{formatSize(file.size)}</span>
        {file.lastModifiedAgo && <span>Modified {file.lastModifiedAgo}</span>}
        {content?.mimeType && <span>{content.mimeType}</span>}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
