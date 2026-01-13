import { create } from 'zustand';

interface TerminalState {
  selectedSession: string | null;
  agentName: string | null;
  /** SSH terminal base URL from config */
  sshBaseUrl: string | null;
  /** Whether SSH terminal is enabled */
  sshEnabled: boolean;
  openModal: (session: string, agentName: string) => void;
  closeModal: () => void;
  setSshConfig: (baseUrl: string, enabled: boolean) => void;
  /** Generate SSH terminal URL for a session */
  getSshTerminalUrl: (session: string) => string | null;
}

/**
 * Terminal state store
 *
 * Manages terminal access configuration for SSH-based web terminals.
 * The embedded xterm.js terminal has been deprecated in favor of SSH terminals
 * which provide better reliability and full terminal features.
 */
export const useTerminalStore = create<TerminalState>((set, get) => ({
  selectedSession: null,
  agentName: null,
  sshBaseUrl: null,
  sshEnabled: false,
  openModal: (session: string, agentName: string) => {
    const state = get();
    if (state.sshEnabled && state.sshBaseUrl) {
      // Open SSH terminal in new browser tab
      const url = state.getSshTerminalUrl(session);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
    set({ selectedSession: session, agentName });
  },
  closeModal: () => {
    set({ selectedSession: null, agentName: null });
  },
  setSshConfig: (baseUrl: string, enabled: boolean) => {
    set({ sshBaseUrl: baseUrl, sshEnabled: enabled });
  },
  getSshTerminalUrl: (session: string) => {
    const state = get();
    if (!state.sshEnabled || !state.sshBaseUrl) {
      return null;
    }
    // Append session as path parameter for tmux attach
    // The SSH web terminal (wetty/gotty/Guacamole) should be configured
    // to run: tmux attach -t {session}
    const baseUrl = state.sshBaseUrl.endsWith('/')
      ? state.sshBaseUrl.slice(0, -1)
      : state.sshBaseUrl;
    return `${baseUrl}?session=${encodeURIComponent(session)}`;
  },
}));
