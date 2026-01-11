import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, isBrowserMode } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Square, Loader2, CheckCircle, Cpu, Terminal, MessageSquare, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToastStore } from '@/store/toastStore';
import { useCronOutputStore } from '@/store/cronOutputStore';
import type { CronAgentInfo, CronOutputEvent } from '@/types';

// Log parsing (reused from modal)
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
  if (entries.length === 0) return <div className="text-muted-foreground text-sm p-4">No output</div>;
  return <div className="space-y-1 p-2">{entries.map((entry, i) => <LogEntryRenderer key={i} entry={entry} />)}</div>;
};

interface CronAgentOutputPanelProps {
  embedded?: boolean;
}

export const CronAgentOutputPanel: React.FC<CronAgentOutputPanelProps> = ({ embedded = false }) => {
  const { selectedAgent: agentName, selectedRunId, closeOutput } = useCronOutputStore();
  const [agent, setAgent] = useState<CronAgentInfo | null>(null);
  const [liveOutput, setLiveOutput] = useState<CronOutputEvent[]>([]);
  const [liveOutputAutoScroll, setLiveOutputAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveOutputRef = useRef<HTMLDivElement>(null);
  const { error: showError, success: showSuccess } = useToastStore();

  const fetchAgent = useCallback(async () => {
    if (!agentName) return;
    try {
      const agents = await invoke<CronAgentInfo[]>('list_cron_agents');
      const found = agents.find(a => a.name === agentName);
      setAgent(found || null);
    } catch (err) {
      showError(`Failed to load agent: ${err}`);
    }
  }, [agentName, showError]);

  useEffect(() => {
    if (!agentName) return;
    setLiveOutput([]);
    setCollapsed(false);
    fetchAgent();
  }, [agentName, fetchAgent]);

  // Subscribe to real-time output
  useEffect(() => {
    if (!agentName || isBrowserMode()) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsubscribe = await listen<CronOutputEvent>('cronos:output', (event) => {
          if (event.payload.agent_name === agentName) {
            setLiveOutput(prev => [...prev.slice(-500), event.payload]);
          }
        });
        cleanup = unsubscribe;
      } catch { /* ignore */ }
    })();
    return () => cleanup?.();
  }, [agentName]);

  // Fetch log for selected run
  useEffect(() => {
    if (!agentName) return;

    // Determine which run to show: explicit selection, current running, or last run
    const runId = selectedRunId || agent?.current_run_id || agent?.last_run?.run_id;
    if (!runId) {
      setError('No run ID available');
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch immediately
    const fetchLog = async () => {
      try {
        const result = await invoke<string | { log: string }>('get_cron_run_log', { runId });
        const logContent = typeof result === 'string' ? result : result?.log ?? '';
        if (logContent) {
          const events: CronOutputEvent[] = logContent.split('\n').filter(Boolean).map(line => ({
            run_id: runId, agent_name: agentName, event_type: 'stdout' as const, content: line, timestamp: new Date().toISOString(),
          }));
          setLiveOutput(events);
          setError(null);
        } else {
          setLiveOutput([]);
        }
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch cron log:', err);
        setError(`Failed to load log: ${err}`);
        setLoading(false);
      }
    };

    fetchLog();

    // Poll for updates if agent is running
    const poll = setInterval(async () => {
      await fetchAgent();
      await fetchLog();
    }, 1500);

    return () => clearInterval(poll);
  }, [agentName, selectedRunId, agent?.current_run_id, agent?.last_run?.run_id, fetchAgent]);

  useEffect(() => {
    if (liveOutputAutoScroll && liveOutputRef.current) {
      liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight;
    }
  }, [liveOutput, liveOutputAutoScroll]);

  const handleScroll = () => {
    const c = liveOutputRef.current;
    if (c) setLiveOutputAutoScroll(c.scrollHeight - c.scrollTop - c.clientHeight < 100);
  };

  const handleCancel = async () => {
    if (!agentName) return;
    try {
      await invoke('cancel_cron_agent', { name: agentName });
      showSuccess(`Cancelled ${agentName}`);
      fetchAgent();
    } catch (err) {
      showError(`Failed to cancel agent: ${err}`);
    }
  };

  if (!agentName) {
    if (embedded) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Select a run to view logs</p>
        </div>
      );
    }
    return null;
  }

  const combinedContent = liveOutput.map(e => e.content).join('\n');
  const isRunning = agent?.is_running ?? false;

  // Embedded mode - just the scrollable content, no wrapper
  if (embedded) {
    return (
      <div className="h-full flex flex-col">
        {/* Compact status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            ) : (
              <CheckCircle className="w-3 h-3 text-green-500" />
            )}
            <span className="text-xs text-muted-foreground">
              {isRunning ? 'Running...' : 'Completed'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isRunning && (
              <Button variant="destructive" size="sm" onClick={handleCancel} className="h-6 text-xs px-2">
                <Square className="w-3 h-3 mr-1" />Stop
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={closeOutput} className="h-6 w-6">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div
          ref={liveOutputRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {loading ? (
            <div className="text-muted-foreground text-sm p-8 flex items-center justify-center h-full">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading logs...
            </div>
          ) : error ? (
            <div className="text-destructive text-sm p-8 flex items-center justify-center h-full">
              {error}
            </div>
          ) : liveOutput.length === 0 ? (
            <div className="text-muted-foreground text-sm p-8 flex items-center justify-center h-full">
              {isRunning ? 'Starting agent...' : 'No output available'}
            </div>
          ) : (
            <LogRenderer content={combinedContent} />
          )}
        </div>
      </div>
    );
  }

  // Standalone mode - full card with header
  return (
    <div className="flex-shrink-0 border-t border-border/30 bg-card/30 rounded-xl mt-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          <div>
            <h3 className="text-sm font-medium">Cron Output - {agentName}</h3>
            <p className="text-xs text-muted-foreground">
              {isRunning ? 'Running...' : 'Completed'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button variant="destructive" size="sm" onClick={handleCancel} className="h-7 text-xs">
              <Square className="w-3 h-3 mr-1" />Stop
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-7 w-7">
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={closeOutput} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Output (collapsible) */}
      {!collapsed && (
        <div
          ref={liveOutputRef}
          onScroll={handleScroll}
          className="max-h-[300px] overflow-y-auto"
        >
          {liveOutput.length === 0 ? (
            <div className="text-muted-foreground text-sm p-8 flex items-center justify-center">
              {isRunning ? 'Starting agent...' : 'No output available'}
            </div>
          ) : (
            <LogRenderer content={combinedContent} />
          )}
        </div>
      )}
    </div>
  );
};
