/**
 * Event listener wrapper for Nolan frontend
 *
 * Provides a unified interface for real-time events that works in both:
 * - Tauri desktop app (uses Tauri events)
 * - Browser (uses WebSocket)
 *
 * Usage:
 *   import { listen } from '@/lib/events';
 *   const unlisten = await listen('terminal-output', (event) => {
 *     console.log(event.payload);
 *   });
 *   // Later: unlisten();
 */

import { getWebSocketUrl, isBrowserMode } from './api';

// Type for event payload
export interface EventPayload<T = unknown> {
  payload: T;
}

// Type for unlisten function
export type UnlistenFn = () => void;

// Active WebSocket connections (for browser mode)
const activeConnections = new Map<string, WebSocket>();

// Terminal output listeners by session (for browser mode)
const terminalListeners = new Map<string, Set<(event: EventPayload<unknown>) => void>>();

/**
 * Listen to a real-time event
 *
 * In Tauri: Uses native event system
 * In Browser: Uses WebSocket connection
 *
 * @param event - Event name (e.g., 'terminal-output', 'history-entry')
 * @param callback - Function to call when event is received
 * @param options - Optional parameters (e.g., session for terminal-output)
 * @returns Promise that resolves to an unlisten function
 */
export async function listen<T>(
  event: string,
  callback: (event: EventPayload<T>) => void,
  options?: { session?: string }
): Promise<UnlistenFn> {
  if (!isBrowserMode()) {
    // Use native Tauri events
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, callback);
  }

  // Browser mode - use WebSocket

  // Special handling for terminal-output - needs session parameter
  if (event === 'terminal-output' && options?.session) {
    return listenTerminalOutput(options.session, callback as (event: EventPayload<unknown>) => void);
  }

  // Special handling for agent-status-changed - use dedicated WebSocket
  if (event === 'agent-status-changed') {
    return listenAgentStatus(callback as (event: EventPayload<unknown>) => void);
  }

  // Special handling for history-entry - use dedicated WebSocket
  if (event === 'history-entry') {
    return listenHistoryEntry(callback as (event: EventPayload<unknown>) => void);
  }

  // Events that don't have WebSocket endpoints in browser mode
  const unsupportedEvents = [
    'terminal-disconnected',
  ];

  if (unsupportedEvents.includes(event)) {
    console.log(`[events] Event '${event}' not supported in browser mode`);
    return () => {};
  }

  // Generic WebSocket connection for other events
  const wsUrl = getWebSocketUrl(`/api/ws/${event}`);

  // Close existing connection if any
  const existing = activeConnections.get(event);
  if (existing) {
    existing.close();
  }

  const ws = new WebSocket(wsUrl);

  ws.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data) as T;
      callback({ payload });
    } catch (err) {
      console.error(`Failed to parse WebSocket message for ${event}:`, err);
    }
  };

  ws.onerror = (err) => {
    console.error(`WebSocket error for ${event}:`, err);
  };

  ws.onclose = () => {
    activeConnections.delete(event);
  };

  activeConnections.set(event, ws);

  // Return unlisten function
  return () => {
    ws.close();
    activeConnections.delete(event);
  };
}

/**
 * Listen to terminal output for a specific session (browser mode)
 */
function listenTerminalOutput(
  session: string,
  callback: (event: EventPayload<unknown>) => void
): UnlistenFn {
  const wsKey = `terminal-${session}`;

  // Add callback to listeners
  if (!terminalListeners.has(session)) {
    terminalListeners.set(session, new Set());
  }
  terminalListeners.get(session)!.add(callback);

  // Create WebSocket if not exists
  if (!activeConnections.has(wsKey)) {
    const wsUrl = getWebSocketUrl(`/api/ws/terminal/${session}`);
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        // Notify all listeners for this session
        const listeners = terminalListeners.get(session);
        if (listeners) {
          listeners.forEach(cb => cb({ payload }));
        }
      } catch (err) {
        console.error(`Failed to parse terminal WebSocket message:`, err);
      }
    };

    ws.onerror = (err) => {
      console.error(`Terminal WebSocket error for ${session}:`, err);
    };

    ws.onclose = () => {
      activeConnections.delete(wsKey);
      terminalListeners.delete(session);
    };

    activeConnections.set(wsKey, ws);
  }

  // Return unlisten function
  return () => {
    const listeners = terminalListeners.get(session);
    if (listeners) {
      listeners.delete(callback);
      // Close WebSocket if no more listeners
      if (listeners.size === 0) {
        const ws = activeConnections.get(wsKey);
        if (ws) {
          ws.close();
        }
        activeConnections.delete(wsKey);
        terminalListeners.delete(session);
      }
    }
  };
}

// Status listeners (for browser mode)
const statusListeners = new Set<(event: EventPayload<unknown>) => void>();

/**
 * Listen to agent status changes (browser mode)
 */
function listenAgentStatus(
  callback: (event: EventPayload<unknown>) => void
): UnlistenFn {
  const wsKey = 'status';

  // Add callback to listeners
  statusListeners.add(callback);

  // Create WebSocket if not exists
  if (!activeConnections.has(wsKey)) {
    createStatusWebSocket(wsKey);
  }

  return () => {
    statusListeners.delete(callback);
    // Close WebSocket if no more listeners
    if (statusListeners.size === 0) {
      const ws = activeConnections.get(wsKey);
      if (ws) {
        ws.close();
      }
      activeConnections.delete(wsKey);
    }
  };
}

/**
 * Create WebSocket for status updates (internal helper)
 */
function createStatusWebSocket(wsKey: string): void {
  const wsUrl = getWebSocketUrl('/api/ws/status');
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      // Notify all listeners
      statusListeners.forEach(cb => cb({ payload }));
    } catch (err) {
      console.error('Failed to parse status WebSocket message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('Status WebSocket error:', err);
  };

  ws.onclose = () => {
    activeConnections.delete(wsKey);
    // Only reconnect if there are still listeners
    if (statusListeners.size > 0) {
      setTimeout(() => {
        if (!activeConnections.has(wsKey) && statusListeners.size > 0) {
          createStatusWebSocket(wsKey);
        }
      }, 3000);
    }
  };

  activeConnections.set(wsKey, ws);
}

// History entry listeners (for browser mode)
const historyListeners = new Set<(event: EventPayload<unknown>) => void>();

/**
 * Create WebSocket for history updates (internal helper)
 */
function createHistoryWebSocket(wsKey: string): void {
  const wsUrl = getWebSocketUrl('/api/ws/history');
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      // Notify all listeners
      historyListeners.forEach(cb => cb({ payload }));
    } catch (err) {
      console.error('Failed to parse history WebSocket message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('History WebSocket error:', err);
  };

  ws.onclose = () => {
    activeConnections.delete(wsKey);
    // Only reconnect if there are still listeners
    if (historyListeners.size > 0) {
      setTimeout(() => {
        if (!activeConnections.has(wsKey) && historyListeners.size > 0) {
          createHistoryWebSocket(wsKey);
        }
      }, 3000);
    }
  };

  activeConnections.set(wsKey, ws);
}

/**
 * Listen to history entry updates (browser mode)
 */
function listenHistoryEntry(
  callback: (event: EventPayload<unknown>) => void
): UnlistenFn {
  const wsKey = 'history';

  // Add callback to listeners
  historyListeners.add(callback);

  // Create WebSocket if not exists
  if (!activeConnections.has(wsKey)) {
    createHistoryWebSocket(wsKey);
  }

  // Return unlisten function
  return () => {
    historyListeners.delete(callback);
    // Close WebSocket if no more listeners
    if (historyListeners.size === 0) {
      const ws = activeConnections.get(wsKey);
      if (ws) {
        ws.close();
      }
      activeConnections.delete(wsKey);
    }
  };
}

/**
 * Emit an event (mainly for testing or local events)
 *
 * In Tauri: Uses native event system
 * In Browser: Not supported (WebSocket is receive-only from server)
 */
export async function emit<T>(event: string, payload: T): Promise<void> {
  if (!isBrowserMode()) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    return tauriEmit(event, payload);
  }

  // In browser mode, events are server-initiated only
  console.warn(`emit() not supported in browser mode. Event: ${event}`);
}

/**
 * Close all active WebSocket connections
 * Call this when unmounting or cleaning up
 */
export function closeAllConnections(): void {
  for (const ws of activeConnections.values()) {
    ws.close();
  }
  activeConnections.clear();
}
