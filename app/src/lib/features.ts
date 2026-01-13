/**
 * Feature Flags for Nolan
 *
 * These flags allow phased rollout and easy rollback of features.
 */

export const FEATURES = {
  /**
   * Enable embedded terminal viewer within Nolan UI
   * DEPRECATED: Embedded terminals are replaced by SSH-based web terminals.
   * Configure ssh_terminal in config.yaml instead.
   */
  EMBEDDED_TERMINAL: false,

  /**
   * Enable external terminal launcher (desktop only)
   * - Set to false to hide "Open External" buttons
   * - Uses native terminal apps (gnome-terminal, iTerm2, etc.)
   */
  EXTERNAL_TERMINAL: true,
};
