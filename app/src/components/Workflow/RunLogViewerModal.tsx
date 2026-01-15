import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { invoke, isBrowserMode } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Loader2, CheckCircle, Cpu, Terminal, MessageSquare, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ScheduledRunLog, ScheduledOutputEvent } from '@/types';

// Log parsing types
interface LogEntry {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> };
  tool_use_result?: { stdout?: string; stderr?: string; content?: string };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  model?: string;
  cwd?: string;
}

interface ParsedLogEntry {
  type: 'system' | 'assistant-text' | 'tool-use' | 'tool-result' | 'result' | 'raw';
  content: string;
  metadata?: { model?: string; cwd?: string; toolName?: string; toolInput?: Record<string, unknown>; duration?: number; cost?: number; isError?: boolean };
}

function parseLogEntries(content: unknown): ParsedLogEntry[] {
  if (typeof content !== 'string') return [];
  const lines = content.trim().split('\n');
  const entries: ParsedLogEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: LogEntry = JSON.parse(line);
      switch (entry.type) {
        case 'system':
          if (entry.subtype === 'init') entries.push({ type: 'system', content: 'Session initialized', metadata: { model: entry.model, cwd: entry.cwd } });
          break;
        case 'assistant':
          if (entry.message?.content) {
            for (const block of entry.message.content) {
              if (block.type === 'text' && block.text) entries.push({ type: 'assistant-text', content: block.text });
              else if (block.type === 'tool_use' && block.name) entries.push({ type: 'tool-use', content: block.name, metadata: { toolName: block.name, toolInput: block.input } });
            }
          }
          break;
        case 'user':
          if (entry.tool_use_result) {
            const { stdout, stderr, content: resultContent } = entry.tool_use_result;
            const output = typeof stdout === 'string' ? stdout : typeof resultContent === 'string' ? resultContent : '';
            if (output) entries.push({ type: 'tool-result', content: output, metadata: { isError: false } });
            if (stderr && typeof stderr === 'string') entries.push({ type: 'tool-result', content: stderr, metadata: { isError: true } });
          }
          break;
        case 'result':
          entries.push({ type: 'result', content: entry.result || 'Completed', metadata: { duration: entry.duration_ms, cost: entry.total_cost_usd } });
          break;
      }
    } catch {
      entries.push({ type: 'raw', content: line });
    }
  }
  return entries;
}

const markdownComponents: import('react-markdown').Components = {
  pre: ({ children }) => <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-xs my-2">{children}</pre>,
  code: ({ className, children }) => !className ? <code className="bg-muted/50 px-1 py-0.5 rounded text-xs">{children}</code> : <code className={className}>{children}</code>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
};

const LogEntryRenderer: React.FC<{ entry: ParsedLogEntry }> = ({ entry }) => {
  switch (entry.type) {
    case 'system':
      return (
        <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded text-xs text-muted-foreground border-l-2 border-blue-500/50">
          <Cpu className="w-3 h-3" /><span>{entry.content}</span>
          {entry.metadata?.model && <Badge variant="outline" className="text-[10px] h-4">{entry.metadata.model}</Badge>}
        </div>
      );
    case 'assistant-text': {
      const text = typeof entry.content === 'string' ? entry.content : '';
      if (!text) return null;
      return (
        <div className="py-2 px-3 border-l-2 border-green-500/50">
          <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground"><MessageSquare className="w-3 h-3" /><span>Assistant</span></div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>{text}</ReactMarkdown>
          </div>
        </div>
      );
    }
    case 'tool-use':
      return (
        <div className="py-2 px-3 bg-blue-500/5 border-l-2 border-blue-500/50">
          <div className="flex items-center gap-2 text-xs">
            <Terminal className="w-3 h-3 text-blue-400" />
            <span className="font-medium text-blue-400">{entry.metadata?.toolName}</span>
            {entry.metadata?.toolInput && (
              <span className="text-muted-foreground font-mono truncate max-w-[400px]">
                {(() => { const i = entry.metadata.toolInput; if ('command' in i) return String(i.command); if ('description' in i) return String(i.description); return ''; })()}
              </span>
            )}
          </div>
        </div>
      );
    case 'tool-result': {
      const content = typeof entry.content === 'string' ? entry.content : '';
      if (!content.trim()) return null;
      const lines = content.split('\n');
      const truncated = lines.length > 20;
      const display = truncated ? lines.slice(0, 20).join('\n') + '\n...' : content;
      return (
        <div className={`py-1 px-3 text-xs font-mono ${entry.metadata?.isError ? 'text-red-400' : 'text-muted-foreground'}`}>
          <pre className="whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">{display}</pre>
        </div>
      );
    }
    case 'result': {
      const text = typeof entry.content === 'string' ? entry.content : '';
      return (
        <div className="py-3 px-3 bg-green-500/10 border-l-2 border-green-500 mt-2">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" /><span className="font-medium text-green-500">Completed</span>
            {entry.metadata?.duration && <span className="text-xs text-muted-foreground">{(entry.metadata.duration / 1000).toFixed(1)}s</span>}
            {entry.metadata?.cost && <span className="text-xs text-muted-foreground">${entry.metadata.cost.toFixed(4)}</span>}
          </div>
          {text && text !== 'Completed' && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm mt-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>{text}</ReactMarkdown>
            </div>
          )}
        </div>
      );
    }
    case 'raw': {
      const raw = typeof entry.content === 'string' ? entry.content : '';
      return raw ? <div className="py-1 px-3 text-xs font-mono text-muted-foreground">{raw}</div> : null;
    }
    default: return null;
  }
};

const LogRenderer: React.FC<{ content: string }> = ({ content }) => {
  const entries = useMemo(() => parseLogEntries(content), [content]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  if (entries.length === 0) return <div className="text-muted-foreground text-sm p-4">No output</div>;

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={entries}
      followOutput="smooth"
      overscan={40}
      className="flex-1"
      itemContent={(_index, entry) => (
        <div className="px-2 py-0.5">
          <LogEntryRenderer entry={entry} />
        </div>
      )}
    />
  );
};

interface RunLogViewerModalProps {
  runId: string | null;
  stageName?: string;
  onClose: () => void;
}

export const RunLogViewerModal: React.FC<RunLogViewerModalProps> = ({
  runId,
  stageName,
  onClose,
}) => {
  const [runLog, setRunLog] = useState<ScheduledRunLog | null>(null);
  const [logContent, setLogContent] = useState<string>('');
  const [liveOutput, setLiveOutput] = useState<ScheduledOutputEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    if (!runId) return;
    try {
      // Fetch run log metadata
      const history = await invoke<ScheduledRunLog[]>('get_scheduled_run_history', { limit: 100 });
      const run = history.find(r => r.run_id === runId);
      setRunLog(run || null);

      // Fetch log content
      const result = await invoke<string | { log: string }>('get_scheduled_run_log', { run_id: runId });
      const content = typeof result === 'string' ? result : result?.log ?? '';
      setLogContent(content);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load log');
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    setIsLoading(true);
    setLiveOutput([]);
    setLogContent('');
    fetchLog();
  }, [runId, fetchLog]);

  // Subscribe to real-time output if run is still active
  useEffect(() => {
    if (!runId || isBrowserMode()) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsubscribe = await listen<ScheduledOutputEvent>('scheduler:output', (event) => {
          if (event.payload.run_id === runId) {
            setLiveOutput(prev => [...prev.slice(-500), event.payload]);
          }
        });
        cleanup = unsubscribe;
      } catch (err) {
        console.error('Failed to subscribe to scheduler output:', err);
      }
    })();
    return () => cleanup?.();
  }, [runId]);

  // Poll for updates if run is still active
  useEffect(() => {
    if (!runId || !runLog) return;
    // Only poll if run is not completed
    if (runLog.completed_at) return;

    const poll = setInterval(fetchLog, 2000);
    return () => clearInterval(poll);
  }, [runId, runLog, fetchLog]);

  // Combine stored log content with live output
  const combinedContent = liveOutput.length > 0
    ? liveOutput.map(e => e.content).join('\n')
    : logContent;

  const isRunning = runLog && !runLog.completed_at;
  const isFailed = runLog?.status === 'failed' || runLog?.exit_code !== 0;

  return (
    <Dialog open={!!runId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-border space-y-0">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : isRunning ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            ) : isFailed ? (
              <XCircle className="w-5 h-5 text-red-500" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            <div>
              <DialogTitle>
                {stageName ? `${stageName} Logs` : 'Run Logs'}
              </DialogTitle>
              <DialogDescription className="font-mono">
                {runLog?.agent_name || runId}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 mr-8">
            {runLog && (
              <>
                <Badge variant={isRunning ? 'secondary' : isFailed ? 'destructive' : 'default'}>
                  {runLog.status}
                </Badge>
                {runLog.duration_secs && (
                  <span className="text-xs text-muted-foreground">
                    {runLog.duration_secs.toFixed(1)}s
                  </span>
                )}
                {runLog.total_cost_usd && (
                  <span className="text-xs text-muted-foreground">
                    ${runLog.total_cost_usd.toFixed(4)}
                  </span>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        {/* Output */}
        <div className="flex-1 overflow-hidden min-h-[400px]">
          {isLoading ? (
            <div className="text-muted-foreground text-sm p-8 h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading logs...
            </div>
          ) : error ? (
            <div className="text-red-500 text-sm p-8 h-full flex items-center justify-center">
              {error}
            </div>
          ) : !combinedContent ? (
            <div className="text-muted-foreground text-sm p-8 h-full flex items-center justify-center">
              {isRunning ? 'Waiting for output...' : 'No output available'}
            </div>
          ) : (
            <LogRenderer content={combinedContent} />
          )}
        </div>

        {/* Footer with run details */}
        {runLog && (
          <div className="p-3 border-t border-border text-xs text-muted-foreground flex flex-wrap gap-4">
            <span>Started: {new Date(runLog.started_at).toLocaleString()}</span>
            {runLog.completed_at && (
              <span>Completed: {new Date(runLog.completed_at).toLocaleString()}</span>
            )}
            {runLog.worktree_branch && (
              <span className="font-mono">Branch: {runLog.worktree_branch}</span>
            )}
            {runLog.attempt > 1 && (
              <span>Attempt #{runLog.attempt}</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
