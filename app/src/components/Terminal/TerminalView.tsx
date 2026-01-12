import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { invoke } from '@/lib/api';
import { listen } from '@/lib/events';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  session: string;
  agentName: string;
  onClose?: () => void;
  fontSize?: number;
}

interface TerminalOutputEvent {
  session: string;
  data: string;
  timestamp: number;
}

/**
 * Get terminal theme - black background with white text for all terminals
 */
function getAgentTheme() {
  // Use consistent black background and white text for all native terminals
  return {
    background: '#18181b',
    foreground: '#a1a1aa',
    cursor: '#a1a1aa',
    selectionBackground: '#3f3f46',
  };
}

/**
 * TerminalView component
 *
 * Embeddable xterm.js terminal with bidirectional communication to backend
 */
export function TerminalView({ session, agentName, onClose, fontSize = 13 }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce function for resize events
  const debounce = (fn: () => void, delay: number) => {
    let timeout: ReturnType<typeof setTimeout>;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(fn, delay);
    };
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js with black background and white text theme
    const theme = getAgentTheme();
    const terminal = new Terminal({
      theme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none', // Hide cursor when not focused
      scrollback: 10000,
      convertEol: true,
      // Prevent auto-scrolling on every output - we'll handle this manually
      scrollOnUserInput: true,
    });

    xtermRef.current = terminal;

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    fitAddonRef.current = fitAddon;

    // Open terminal in DOM
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Smart fit function - only fit if container dimensions actually changed
    const smartFit = () => {
      if (!terminalRef.current) return;

      const rect = terminalRef.current.getBoundingClientRect();
      const currentDims = { cols: Math.floor(rect.width), rows: Math.floor(rect.height) };

      // Only fit if dimensions changed significantly (more than 10px)
      const lastDims = lastDimensionsRef.current;
      if (lastDims &&
          Math.abs(currentDims.cols - lastDims.cols) < 10 &&
          Math.abs(currentDims.rows - lastDims.rows) < 10) {
        return; // Skip fit - dimensions haven't changed enough
      }

      lastDimensionsRef.current = currentDims;
      fitAddon.fit();
    };

    // Debounced fit function for resize events
    const debouncedFit = debounce(smartFit, 100);

    // Handle window resize
    window.addEventListener('resize', debouncedFit);

    // Add ResizeObserver to detect container dimension changes (for draggable modal)
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Track user scroll - when user scrolls up, stop auto-scrolling
    terminal.onScroll(() => {
      const viewport = terminal.buffer.active;
      const isAtBottom = viewport.baseY + terminal.rows >= viewport.length;

      if (!isAtBottom) {
        userScrolledRef.current = true;
        // Reset user scroll flag after 3 seconds of no scrolling
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          userScrolledRef.current = false;
        }, 3000);
      } else {
        userScrolledRef.current = false;
      }
    });

    // Listen for terminal resize events from xterm.js
    // This fires after FitAddon.fit() recalculates dimensions
    terminal.onResize((dimensions) => {
      // Notify backend of new PTY dimensions
      invoke('resize_terminal', {
        session,
        cols: dimensions.cols,
        rows: dimensions.rows,
      }).catch((err) => {
        console.error(`Failed to resize PTY for ${session}:`, err);
      });
    });

    // Setup terminal output listener
    // Pass session option for browser mode WebSocket routing
    const unsubscribeOutput = listen<TerminalOutputEvent>('terminal-output', (event) => {
      if (event.payload.session === session) {
        // Save scroll position before write
        const wasAtBottom = !userScrolledRef.current;

        terminal.write(event.payload.data);

        // Only scroll to bottom if user hasn't manually scrolled up
        if (wasAtBottom && !userScrolledRef.current) {
          terminal.scrollToBottom();
        }
      }
    }, { session });

    // Setup terminal disconnected listener
    const unsubscribeDisconnected = listen<string>('terminal-disconnected', (event) => {
      if (event.payload === session) {
        terminal.writeln('\r\n[Terminal disconnected - agent session ended]');
        terminal.write('\r\n');
      }
    });

    // ✅ FIX BUG-5: Show loading message while stream starts
    terminal.writeln('[Connecting to agent terminal...]');

    // Start terminal stream from backend
    invoke('start_terminal_stream', { session })
      .then(() => {
        // Don't show success message - let output speak for itself
      })
      .catch((err) => {
        console.error(`Failed to start terminal stream for ${session}:`, err);
        terminal.writeln(`\r\n[Error: Failed to start terminal stream: ${err}]`);
      });

    // Handle user input
    terminal.onData((data) => {
      handleTerminalInput(session, data);
    });

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', debouncedFit);
      resizeObserver.disconnect();

      // Clear scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Unsubscribe from events (handle potential rejections during cleanup)
      unsubscribeOutput.then(unsub => unsub?.()).catch(() => {});
      unsubscribeDisconnected.then(unsub => unsub?.()).catch(() => {});

      // Stop terminal stream
      invoke('stop_terminal_stream', { session }).catch((err) => {
        console.error(`Failed to stop terminal stream for ${session}:`, err);
      });

      // Dispose terminal
      terminal.dispose();
    };
  }, [session, agentName, fontSize]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={terminalRef}
        className="w-full h-full"
        style={{ padding: '8px' }}
      />
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
          title="Close terminal"
        >
          Close
        </button>
      )}
    </div>
  );
}

/**
 * Handle terminal input and send to backend
 * Detects special keys and ANSI escape sequences
 */
function handleTerminalInput(session: string, data: string) {
  // Handle special characters
  if (data === '\r' || data === '\n') {
    // Enter key
    invoke('send_terminal_key', { session, key: 'Enter' }).catch((err) => {
      console.error('Failed to send Enter key:', err);
    });
    return;
  }

  if (data === '\x7f') {
    // Backspace
    invoke('send_terminal_key', { session, key: 'Backspace' }).catch((err) => {
      console.error('Failed to send Backspace key:', err);
    });
    return;
  }

  if (data === '\t') {
    // Tab
    invoke('send_terminal_key', { session, key: 'Tab' }).catch((err) => {
      console.error('Failed to send Tab key:', err);
    });
    return;
  }

  if (data === '\x1b') {
    // Escape
    invoke('send_terminal_key', { session, key: 'Escape' }).catch((err) => {
      console.error('Failed to send Escape key:', err);
    });
    return;
  }

  // Handle ANSI escape sequences (arrow keys)
  if (data.startsWith('\x1b[')) {
    const keyMap: Record<string, string> = {
      '\x1b[A': 'ArrowUp',
      '\x1b[B': 'ArrowDown',
      '\x1b[C': 'ArrowRight',
      '\x1b[D': 'ArrowLeft',
      '\x1b[H': 'Home',
      '\x1b[F': 'End',
    };

    const key = keyMap[data];
    if (key) {
      invoke('send_terminal_key', { session, key }).catch((err) => {
        console.error(`Failed to send ${key} key:`, err);
      });
      return;
    }
  }

  // Send regular text input
  invoke('send_terminal_input', { session, data }).catch((err) => {
    console.error('Failed to send terminal input:', err);
  });
}
