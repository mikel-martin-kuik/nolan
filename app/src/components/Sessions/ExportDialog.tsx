import { useState } from 'react';
import { exportSessionHtml, exportSessionMarkdown } from '@/hooks/useSessions';
import { Session } from '@/types/sessions';

interface ExportDialogProps {
  session: Session;
  onClose: () => void;
}

export function ExportDialog({ session, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<'html' | 'markdown'>('markdown');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(null);

    try {
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const sanitizedSummary = (session?.summary || 'session').substring(0, 50).replace(/[^a-z0-9]/gi, '-');
      const extension = format === 'html' ? 'html' : 'md';
      const filename = `session-${sanitizedSummary}-${timestamp}.${extension}`;

      // Use /tmp directory as default (user can change this)
      const outputPath = `/tmp/${filename}`;

      let resultPath: string;
      if (format === 'html') {
        resultPath = await exportSessionHtml(session.session_id, outputPath);
      } else {
        resultPath = await exportSessionMarkdown(session.session_id, outputPath);
      }

      setSuccess(`Exported to: ${resultPath}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6 border border-border">
        <h2 className="text-xl font-bold mb-4 text-foreground">
          Export Session
        </h2>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">
            {session.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            {session.message_count} messages
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            Export Format
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="markdown"
                checked={format === 'markdown'}
                onChange={(e) => setFormat(e.target.value as 'html' | 'markdown')}
                className="mr-2"
              />
              <span className="text-sm text-foreground">Markdown (.md)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="html"
                checked={format === 'html'}
                onChange={(e) => setFormat(e.target.value as 'html' | 'markdown')}
                className="mr-2"
              />
              <span className="text-sm text-foreground">HTML (.html)</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded text-sm">
            {success}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-accent"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
