import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ListImperativeAPI } from 'react-window';
import { useHistoryStore } from '../../store/historyStore';
import { useAgentStore } from '../../store/agentStore';
import { SessionCard } from '../shared/SessionCard';
import { MessageForm } from '../Communicator/MessageForm';
import { Tooltip } from '../ui/tooltip';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import { HistoryEntry } from '../../types';
import { Session } from '../../types/sessions';
import { Play, Download } from 'lucide-react';
import { sleep } from '../../lib/utils';

interface SentMessage {
  target: string;
  message: string;
  timestamp: number;
}

const SESSION_AUTOSCROLL_KEY = 'session-autoscroll-preferences';

// Session status interface
interface SessionStatus {
  online: boolean;        // From tmux check (authoritative)
  lastActivity: number;   // From timestamp (ms since epoch)
  isActive: boolean;      // Computed: online && recent activity
  displayState: 'active' | 'idle' | 'offline';
}

// Helper function to parse timestamp (NOT a hook - can be called anywhere)
const parseTimestamp = (timestamp: string): number => {
  try {
    // Try ISO format first
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }

    // Fallback: time-only format (HH:MM:SS or HH:MM)
    const parts = timestamp.split(':');
    if (parts.length >= 2 && parts.length <= 3) {
      const [hours, minutes, seconds = 0] = parts.map(Number);

      // Validate ranges (0-23 hours, 0-59 minutes/seconds, no NaN)
      if (
        hours >= 0 && hours < 24 &&
        minutes >= 0 && minutes < 60 &&
        seconds >= 0 && seconds < 60 &&
        !isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)
      ) {
        const today = new Date();
        today.setHours(hours, minutes, seconds, 0);
        return today.getTime();
      }
    }

    // Invalid format - return 0 (will show as offline)
    return 0;
  } catch {
    return 0;
  }
};

// Regular function to compute session status (NOT a hook - doesn't use hooks internally)
const computeSessionStatus = (
  sessionEntries: HistoryEntry[],
  tmuxSession: string | null | undefined,
  allAgents: Array<{ session: string; active: boolean }>
): SessionStatus => {
  // TMUX check (authoritative) - find agent by tmux session name
  const agentStatus = tmuxSession
    ? allAgents.find((a) => a.session === tmuxSession)
    : null;

  const online = agentStatus?.active ?? false;

  // Determine active/idle based on last message type and recency
  const lastEntry = sessionEntries[sessionEntries.length - 1];
  const lastMessageType = lastEntry?.entry_type?.toLowerCase() || '';
  const lastActivity = lastEntry ? parseTimestamp(lastEntry.timestamp) : 0;
  const ageMs = Date.now() - lastActivity;

  // Agent is active if online AND:
  // 1. Last message was user/tool_use/tool_result (definitely processing), OR
  // 2. Last message was assistant BUT very recent (< 5 sec - might continue with tools)
  const isActive = online && (
    lastMessageType === 'user' ||
    lastMessageType === 'tool_use' ||
    lastMessageType === 'tool_result' ||
    (lastMessageType === 'assistant' && ageMs < 5000)  // Recent assistant message
  );

  // Display state
  let displayState: 'active' | 'idle' | 'offline';
  if (!online) {
    displayState = 'offline';
  } else if (isActive) {
    displayState = 'active';
  } else {
    displayState = 'idle';
  }

  return { online, lastActivity, isActive, displayState };
};

export const HistoryCommunicatorPanel: React.FC = () => {
  // History state
  const { entries, addEntry } = useHistoryStore();
  const { coreAgents, spawnedSessions, updateStatus } = useAgentStore();
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  // Communicator state
  const [messageHistory, setMessageHistory] = useState<SentMessage[]>([]);

  // Track expanded sessions (default: only most recent is expanded)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Track full session details (with complete token usage)
  const [sessionDetails, setSessionDetails] = useState<Map<string, Session>>(new Map());

  // Active tab for filtering sessions by status
  type SessionTab = 'active' | 'idle' | 'offline';
  const [activeTab, setActiveTab] = useState<SessionTab>('active');

  // Track per-session auto-scroll preferences with localStorage persistence
  const [sessionAutoScroll, setSessionAutoScroll] = useState<Map<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(SESSION_AUTOSCROLL_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);

        // Validate it's an object (not array, null, or primitive)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Filter entries to ensure values are booleans
          const entries = Object.entries(parsed).filter(
            ([_, value]) => typeof value === 'boolean'
          ) as [string, boolean][];

          return new Map(entries);
        }
      }
    } catch (e) {
      console.warn('Failed to restore auto-scroll preferences:', e);
    }

    // Clean up corrupt data after try/catch completes
    // (removeItem outside catch to avoid nested exception handling)
    try {
      localStorage.removeItem(SESSION_AUTOSCROLL_KEY);
    } catch {
      // Ignore removeItem failures
    }

    return new Map();
  });

  // Persist session auto-scroll preferences to localStorage
  useEffect(() => {
    const obj = Object.fromEntries(sessionAutoScroll);
    localStorage.setItem(SESSION_AUTOSCROLL_KEY, JSON.stringify(obj));
  }, [sessionAutoScroll]);

  // Auto-refresh agent status to detect online/idle/offline sessions
  useEffect(() => {
    updateStatus();
    const interval = setInterval(() => {
      updateStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [updateStatus]);

  // Filter out entries with empty messages to prevent gaps in the list
  const filteredEntries = entries.filter(entry => entry.message && entry.message.trim() !== '');

  // Group entries by tmux_session (one card per tmux session, not per Claude session)
  const sessionGroups = React.useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>();

    filteredEntries.forEach(entry => {
      // Group by tmux session instead of session_id to avoid duplicate cards
      const groupKey = entry.tmux_session || entry.session_id || 'unknown';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      const group = groups.get(groupKey);
      if (group) {
        group.push(entry);
      }
    });

    return Array.from(groups.entries())
      .map(([groupKey, entries]) => ({
        sessionId: groupKey,  // Use tmux_session as the unique identifier
        entries,
        agent: entries[0]?.agent || null,
        tmuxSession: entries[0]?.tmux_session || null,
      }));
  }, [filteredEntries]);

  // Combine core and spawned agents for status detection (computed once per render)
  const allAgents = React.useMemo(() => {
    return [...coreAgents, ...spawnedSessions];
  }, [coreAgents, spawnedSessions]);

  // Filter sessions by active tab
  const filteredSessionGroups = React.useMemo(() => {
    return sessionGroups.filter(({ entries, tmuxSession }) => {
      const status = computeSessionStatus(entries, tmuxSession, allAgents);
      return status.displayState === activeTab;
    });
  }, [sessionGroups, allAgents, activeTab]);

  // Fetch full session details for each unique session ID (skip offline sessions for performance)
  useEffect(() => {
    const fetchSessionDetails = async () => {
      // Only fetch details for active/idle sessions, not offline
      const sessionIdsToFetch = sessionGroups
        .filter(({ entries, tmuxSession }) => {
          const status = computeSessionStatus(entries, tmuxSession, allAgents);
          return status.displayState !== 'offline'; // Skip offline sessions
        })
        .map(sg => sg.sessionId)
        .filter(id => id && id !== 'unknown');

      for (const sessionId of sessionIdsToFetch) {
        // Skip if already fetched
        if (sessionDetails.has(sessionId)) {
          continue;
        }

        try {
          const detail = await invoke<{session: Session, messages: any[]}>('get_session_detail', {
            sessionId,
          });

          if (detail && detail.session) {
            setSessionDetails(prev => {
              const next = new Map(prev);
              next.set(sessionId, detail.session);
              return next;
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch session details for ${sessionId}:`, error);
        }
      }
    };

    fetchSessionDetails();
  }, [sessionGroups.map(sg => sg.sessionId).join(','), allAgents]); // Re-run when session IDs or agent status changes

  // Keep track of list refs and container refs for each session
  const sessionListRefs = useRef<Map<string, ListImperativeAPI>>(new Map());
  const sessionContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Toggle session expansion
  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  // Toggle auto-scroll for a specific session
  const handleToggleSessionAutoScroll = (sessionId: string) => {
    setSessionAutoScroll((prev) => {
      const next = new Map(prev);
      // Default to true if not set, so toggle means: true -> false -> true
      const currentValue = next.get(sessionId) ?? true;
      next.set(sessionId, !currentValue);
      return next;
    });
  };

  // Auto-expand the most recent session when new sessions appear
  useEffect(() => {
    if (sessionGroups.length > 0) {
      const mostRecentSessionId = sessionGroups[sessionGroups.length - 1].sessionId;
      setExpandedSessions(prev => {
        if (!prev.has(mostRecentSessionId)) {
          const next = new Set(prev);
          next.add(mostRecentSessionId);
          return next;
        }
        return prev;
      });
    }
  }, [sessionGroups.length]);

  // Auto-scroll to bottom of expanded sessions when new entries arrive
  useEffect(() => {
    if (sessionGroups.length > 0) {
      sessionGroups.forEach(({ sessionId, entries }) => {
        // Check per-session auto-scroll preference (default to true)
        const sessionAutoScrollEnabled = sessionAutoScroll.get(sessionId) ?? true;

        if (expandedSessions.has(sessionId) && sessionAutoScrollEnabled) {
          const sessionRef = sessionListRefs.current.get(sessionId);
          if (sessionRef && entries.length > 0) {
            // Safely scroll to last item with error handling
            try {
              sessionRef.scrollToRow({ index: entries.length - 1, align: 'end' });
            } catch (error) {
              // Ignore scroll errors (can happen during rapid updates)
              console.debug(`Auto-scroll skipped for ${sessionId}:`, error);
            }
          }
        }
      });
    }
  }, [sessionGroups, sessionAutoScroll, expandedSessions]);

  // Load recent history for currently active sessions only (uses same tmux detection as Dashboard)
  // Runs ONCE on mount, then relies on real-time stream for new messages
  useEffect(() => {
    const loadActiveSessionHistory = async () => {
      try {
        // First, ensure we have current agent status (uses same logic as Dashboard)
        await updateStatus();

        // Get currently active tmux sessions (online agents only)
        const activeTmuxSessions = [
          ...coreAgents.filter(a => a.active).map(a => a.session),
          ...spawnedSessions.filter(s => s.active).map(s => s.session),
        ];

        // Load recent history ONLY for active sessions (no offline data)
        if (activeTmuxSessions.length > 0) {
          const result = await invoke<string>('load_history_for_active_sessions', {
            activeSessions: activeTmuxSessions,
            hours: 1,  // Load last hour for active sessions only
          });
          console.log('Loaded active sessions:', result);
        } else {
          console.log('No active sessions found, skipping history load');
        }
      } catch (error) {
        console.error('Failed to load active session history:', error);
      }
    };

    // Wait for agent store to be populated before loading history
    const timeout = setTimeout(loadActiveSessionHistory, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONCE on mount only, not on every agent status update

  // Start history stream and listen for events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;
    let streamStarted = false;

    const setupHistoryStream = async () => {
      try {
        // Start the history streaming backend task
        await invoke('start_history_stream');
        streamStarted = true;

        // Only continue setup if component is still mounted
        if (!isMounted) {
          try {
            await invoke('stop_history_stream');
          } catch (error) {
            console.error('Failed to stop history stream during unmount:', error);
          }
          return;
        }

        setIsStreaming(true);

        // Listen for history entry events
        unlisten = await listen<HistoryEntry>('history-entry', (event) => {
          addEntry(event.payload);
        });
      } catch (error) {
        console.error('Failed to start history stream:', error);
        if (isMounted) {
          setIsStreaming(false);
        }
      }
    };

    setupHistoryStream();

    // Cleanup on unmount
    return () => {
      isMounted = false;

      // Unlisten from events first
      if (unlisten) {
        unlisten();
      }

      // Only stop the stream if it was successfully started
      if (streamStarted) {
        invoke('stop_history_stream').catch((error) => {
          console.error('Failed to stop history stream:', error);
        });
      }
    };
  }, [addEntry]);

  const handleRestartStream = async () => {
    try {
      // Stop existing stream
      await invoke('stop_history_stream');
      setIsStreaming(false);

      // Wait a moment
      await sleep(100);

      // Restart stream
      await invoke('start_history_stream');
      setIsStreaming(true);
    } catch (error) {
      console.error('Failed to restart stream:', error);
      setIsStreaming(false);
    }
  };

  const handleLoadHistory = async (hours: number = 1) => {
    try {
      const result = await invoke<string>('load_history_entries', { hours });
      console.log('History loaded:', result);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleMessageSent = (target: string, message: string) => {
    const newMessage: SentMessage = {
      target,
      message,
      timestamp: Date.now(),
    };

    // Add to history (keep last 10)
    setMessageHistory((prev) => [newMessage, ...prev].slice(0, 10));
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-full">
      <div className="w-full space-y-6 h-full flex flex-col">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
            History & Communicator
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View session logs and communicate with agents
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden gap-6 min-h-0">
          {/* Left Side - Sessions (2/3 width) */}
          <div className="flex-[2] overflow-hidden">
            {/* Log Entries Card */}
            <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
          {/* Header with controls */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground">Sessions</h2>
              <span className="text-sm text-muted-foreground">({filteredSessionGroups.length} sessions)</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Streaming indicator */}
              <Tooltip content="Restart stream" side="bottom">
                <button
                  onClick={handleRestartStream}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-accent transition-all duration-200"
                >
                  <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                  <span className="text-sm text-muted-foreground">
                    {isStreaming ? 'Live' : 'Offline'}
                  </span>
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-shrink-0 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'active'
                    ? 'text-green-400 border border-green-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Active
                  <span className="text-xs opacity-70">
                    ({sessionGroups.filter(sg => computeSessionStatus(sg.entries, sg.tmuxSession, allAgents).displayState === 'active').length})
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('idle')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'idle'
                    ? 'text-yellow-400 border border-yellow-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  Idle
                  <span className="text-xs opacity-70">
                    ({sessionGroups.filter(sg => computeSessionStatus(sg.entries, sg.tmuxSession, allAgents).displayState === 'idle').length})
                  </span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('offline')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'offline'
                    ? 'text-gray-400 border border-gray-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  Offline
                  <span className="text-xs opacity-70">
                    ({sessionGroups.filter(sg => computeSessionStatus(sg.entries, sg.tmuxSession, allAgents).displayState === 'offline').length})
                  </span>
                </div>
              </button>
            </div>

            {/* Load History button - only show on Offline tab */}
            {activeTab === 'offline' && (
              <Tooltip content="Load last hour's sessions" side="left">
                <button
                  onClick={() => handleLoadHistory(1)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-all duration-200 bg-primary/10 text-primary border border-primary/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Load History</span>
                </button>
              </Tooltip>
            )}
          </div>

          {/* Sessions container - scrollable vertical stack */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {filteredSessionGroups.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <p className="mb-2">
                  {activeTab === 'active' && 'No active sessions'}
                  {activeTab === 'idle' && 'No idle sessions'}
                  {activeTab === 'offline' && 'No offline sessions loaded'}
                </p>
                <p className="text-xs opacity-60">
                  {activeTab === 'active' && 'Sessions appear here in real-time as agents work'}
                  {activeTab === 'idle' && 'Sessions appear here when agents are online but inactive'}
                  {activeTab === 'offline' && 'Click "Load History" above to load recent sessions'}
                </p>
              </div>
            </div>
          ) : (
            filteredSessionGroups.map(({ sessionId, entries, agent, tmuxSession }) => {
              const isExpanded = expandedSessions.has(sessionId);
              const status = computeSessionStatus(entries, tmuxSession, allAgents);
              const sessionAutoScrollEnabled = sessionAutoScroll.get(sessionId) ?? true;
              const fullSession = sessionDetails.get(sessionId);
              const isOffline = status.displayState === 'offline';

              return (
                <SessionCard
                  key={sessionId}
                  sessionId={sessionId}
                  sessionName={tmuxSession || agent || 'Unknown Agent'}
                  entries={isOffline ? [] : entries}  // Don't load entries for offline sessions
                  isExpanded={isOffline ? false : isExpanded}  // Offline sessions always collapsed
                  isCollapsible={!isOffline}  // Offline sessions not collapsible
                  onToggle={isOffline ? undefined : () => toggleSession(sessionId)}
                  onSelectEntry={isOffline ? undefined : setSelectedEntry}
                  selectedEntryUuid={selectedEntry?.uuid || null}
                  useVirtualization={!isOffline}
                  autoScrollEnabled={sessionAutoScrollEnabled}
                  listRef={sessionListRefs}
                  containerRef={sessionContainerRefs}
                  agentStatus={status.displayState}
                  tmuxSession={tmuxSession}
                  onToggleAutoScroll={isOffline ? undefined : handleToggleSessionAutoScroll}
                  fullSessionStats={fullSession?.token_usage}
                  lastActivityTime={entries[entries.length - 1]?.timestamp}  // Show last activity for offline sessions
                />
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* Right Side - Message Form (1/3 width) */}
      <div className="flex-1 flex flex-col overflow-hidden gap-4">
        {/* Message form card */}
        <div className="glass-card rounded-2xl p-6 flex-shrink-0">
          <MessageForm onMessageSent={handleMessageSent} />
        </div>

        {/* Message history - takes remaining space when present */}
        {messageHistory.length > 0 && (
          <div className="glass-card rounded-2xl p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <h2 className="text-sm font-semibold text-foreground">Recent Messages</h2>
              <span className="text-xs text-muted-foreground">({messageHistory.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {messageHistory.map((msg, index) => (
                <div
                  key={index}
                  className="glass-card rounded-xl p-2"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-mono text-xs text-primary">
                      {msg.target === 'team' && 'Team'}
                      {msg.target === 'all' && 'All'}
                      {msg.target !== 'team' && msg.target !== 'all' && msg.target}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 break-words">
                    {msg.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
        </div>
      </div>

      {/* Detail popup overlay */}
      {selectedEntry && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8"
            onClick={() => setSelectedEntry(null)}
          >
            <div
              className="glass-card glass-active rounded-2xl w-full max-w-2xl h-[60vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Popup header */}
              <div className="p-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-foreground">Entry Detail</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedEntry.timestamp} • {selectedEntry.entry_type}
                    {selectedEntry.agent && ` • ${selectedEntry.agent}`}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  ✕
                </button>
              </div>
              {/* Popup content */}
              <div className="flex-1 overflow-auto px-4 pb-4 min-h-0">
                {selectedEntry.entry_type.toLowerCase() === 'assistant' ? (
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <MessageRenderer content={selectedEntry.message} />
                  </div>
                ) : (
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed break-words bg-secondary/30 rounded-xl p-4">
                    {selectedEntry.message}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

    </div>
  );
};
