import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { List, ListImperativeAPI, RowComponentProps } from 'react-window';
import { useHistoryStore } from '../../store/historyStore';
import { LogEntry } from './LogEntry';
import { Button } from '../shared/Button';
import { HistoryEntry } from '../../types';
import { Trash2, Pause, Play } from 'lucide-react';

export const HistoryPanel: React.FC = () => {
  const { entries, autoScroll, addEntry, clearEntries, toggleAutoScroll } = useHistoryStore();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);

  // Estimate row height based on message length
  const getRowHeight = (index: number): number => {
    const entry = entries[index];
    if (!entry) return 80;

    // Base: 60px, add 20px per 80 characters
    const messageLines = Math.ceil(entry.message.length / 80);
    return 60 + (messageLines * 20);
  };

  // Row component
  const RowComponent = ({ index, style }: RowComponentProps<Record<string, never>>) => (
    <div style={style}>
      <LogEntry entry={entries[index]} />
    </div>
  );

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && listRef.current && entries.length > 0) {
      listRef.current.scrollToRow({ index: entries.length - 1, align: 'end' });
    }
  }, [entries, autoScroll]);

  // Start history stream and listen for events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupHistoryStream = async () => {
      try {
        // Start the history streaming backend task
        await invoke('start_history_stream');
        setIsStreaming(true);

        // Listen for history entry events
        unlisten = await listen<HistoryEntry>('history-entry', (event) => {
          addEntry(event.payload);
        });
      } catch (error) {
        console.error('Failed to start history stream:', error);
        setIsStreaming(false);
      }
    };

    setupHistoryStream();

    // Cleanup on unmount
    return () => {
      if (unlisten) {
        unlisten();
      }
      // Optionally stop the stream (backend task will stop when app closes)
      invoke('stop_history_stream').catch(console.error);
    };
  }, [addEntry]);

  const handleClear = () => {
    if (confirm('Clear all log entries? This will only clear the display, not the history file.')) {
      clearEntries();
    }
  };

  const handleRestartStream = async () => {
    try {
      // Stop existing stream
      await invoke('stop_history_stream');
      setIsStreaming(false);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Restart stream
      await invoke('start_history_stream');
      setIsStreaming(true);
    } catch (error) {
      console.error('Failed to restart stream:', error);
      setIsStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">History Log</h2>
            <p className="text-gray-400 text-sm">
              Real-time streaming of Claude interaction history
            </p>
          </div>
        <div className="flex items-center gap-2">
          {/* Streaming indicator with restart button */}
          <button
            onClick={handleRestartStream}
            className="flex items-center gap-2 mr-4 px-3 py-1 rounded hover:bg-gray-700 transition-colors"
            title="Click to restart stream"
          >
            <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-sm text-gray-400">
              {isStreaming ? 'Streaming' : 'Disconnected - Click to restart'}
            </span>
          </button>

          {/* Auto-scroll toggle */}
          <Button
            onClick={toggleAutoScroll}
            variant={autoScroll ? 'primary' : 'secondary'}
          >
            {autoScroll ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>

          {/* Clear button */}
          <Button onClick={handleClear} variant="danger">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Info section */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <p className="text-sm text-gray-300">
          <strong>Streaming from:</strong> <code className="text-purple-400">~/.claude/history.jsonl</code>
        </p>
        <p className="text-sm text-gray-400 mt-2">
          This view shows new entries in real-time as Claude agents interact with the system.
          Entries are color-coded by agent and limited to the last 1000 messages in memory.
        </p>
      </div>

      {/* Log container */}
      <div className="flex-1 bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
        {/* Log header */}
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300">
            Log Entries ({entries.length})
          </span>
          {!autoScroll && (
            <span className="text-xs text-yellow-400">Auto-scroll paused</span>
          )}
        </div>

        {/* Virtualized log area */}
        <div className="flex-1" ref={logContainerRef}>
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Waiting for log entries...</p>
            </div>
          ) : (
            <List
              listRef={listRef}
              defaultHeight={logContainerRef.current?.clientHeight || 600}
              rowCount={entries.length}
              rowHeight={getRowHeight}
              rowComponent={RowComponent}
              rowProps={{}}
              style={{ padding: '8px' }}
            />
          )}
        </div>
      </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>
            Memory usage: {entries.length} / 1000 entries
          </span>
          <span>
            Auto-scroll: {autoScroll ? '✓ Enabled' : '✗ Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
};
