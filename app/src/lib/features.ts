/**
 * Feature Flags for Nolan
 *
 * These flags allow phased rollout and easy rollback of features.
 */

export const FEATURES = {
  /**
   * Enable embedded terminal viewer within Nolan UI
   * - Set to false to disable terminal integration
   * - External terminal buttons will still work
   */
  EMBEDDED_TERMINAL: true,

  /**
   * Enable external terminal launcher
   * - Set to false to hide "Open External" buttons
   * - Embedded terminal will still work
   */
  EXTERNAL_TERMINAL: true,
};
