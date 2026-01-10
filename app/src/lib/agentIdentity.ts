/**
 * Agent Identity System
 *
 * Provides visual display names for agents. The "ralph" agent is internally
 * called "ralph" but visually displays as a random fun name from a curated list.
 */

// =============================================================================
// Agent Session Patterns
// =============================================================================
// Centralized regex patterns for agent session matching.
// Use these constants instead of inline regex strings for consistency.
//
// Session naming convention:
// - Team agents: agent-{team}-{name} (e.g., agent-default-ana, agent-decision_logging-dl_coordinator)
//   Team and agent names use underscores (not hyphens) - hyphens are delimiters only
// - Ralph (free agent): agent-ralph-{name} (e.g., agent-ralph-ziggy)

/** Matches team agent sessions: agent-{team}-{name} (underscores in names, hyphens as delimiters) */
export const RE_TEAM_SESSION = /^agent-([a-z][a-z0-9_]*)-([a-z][a-z0-9_]*)$/;

/** Matches Ralph sessions: agent-ralph-{name} */
export const RE_RALPH_SESSION = /^agent-ralph-([a-z0-9]+)$/;

/**
 * Parse a Ralph session name
 * @returns The ralph instance name if it matches, undefined otherwise
 */
export function parseRalphSession(session: string): string | undefined {
  const match = session.match(RE_RALPH_SESSION);
  return match ? match[1] : undefined;
}

/**
 * Parse a team agent session name
 * @returns [team, agentName] if it matches, undefined otherwise
 */
export function parseTeamSession(session: string): [string, string] | undefined {
  const match = session.match(RE_TEAM_SESSION);
  return match ? [match[1], match[2]] : undefined;
}

/**
 * Check if a session belongs to a Ralph agent
 */
export function isRalphSession(session: string): boolean {
  return RE_RALPH_SESSION.test(session);
}

/**
 * Check if a session is a team agent session
 */
export function isTeamSession(session: string): boolean {
  return RE_TEAM_SESSION.test(session);
}

/**
 * 32 fun agent names for visual display
 * These names evoke AI/tech/cosmic themes while being friendly and memorable
 */
export const AGENT_DISPLAY_NAMES = [
  'Nova',
  'Echo',
  'Pixel',
  'Flux',
  'Spark',
  'Cipher',
  'Orbit',
  'Pulse',
  'Zen',
  'Neon',
  'Apex',
  'Qubit',
  'Atlas',
  'Vega',
  'Cosmo',
  'Drift',
  'Glitch',
  'Helix',
  'Ion',
  'Jade',
  'Kira',
  'Luna',
  'Nebula',
  'Onyx',
  'Phoenix',
  'Quantum',
  'Rune',
  'Sage',
  'Terra',
  'Unity',
  'Volt',
  'Warp',
] as const;

export type AgentDisplayName = typeof AGENT_DISPLAY_NAMES[number];

const STORAGE_KEY = 'nolan-ralph-display-name';

/**
 * Get a random display name from the list
 */
function getRandomDisplayName(): AgentDisplayName {
  const index = Math.floor(Math.random() * AGENT_DISPLAY_NAMES.length);
  return AGENT_DISPLAY_NAMES[index];
}

/**
 * Get the visual display name for ralph (persisted in localStorage)
 * Returns the same name across page reloads until explicitly reset
 */
export function getRalphDisplayName(): AgentDisplayName {
  try {
    // Check localStorage for existing assignment
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && AGENT_DISPLAY_NAMES.includes(stored as AgentDisplayName)) {
      return stored as AgentDisplayName;
    }

    // Assign a new random name and persist it
    const newName = getRandomDisplayName();
    try {
      localStorage.setItem(STORAGE_KEY, newName);
    } catch (e) {
      // localStorage is disabled in private mode - silently continue with random name
      console.debug('localStorage unavailable, using in-memory storage');
    }
    return newName;
  } catch (e) {
    // If localStorage access throws, fall back to random name
    console.debug('localStorage access failed:', e);
    return getRandomDisplayName();
  }
}

/**
 * Reset ralph's display name to a new random value
 * Useful if user wants a different name
 */
export function resetRalphDisplayName(): AgentDisplayName {
  const newName = getRandomDisplayName();
  try {
    localStorage.setItem(STORAGE_KEY, newName);
  } catch (e) {
    // localStorage is disabled in private mode - silently continue
    console.debug('localStorage unavailable for reset');
  }
  return newName;
}

/**
 * Get visual display name for any agent
 * - For ralph: returns the assigned fun name (e.g., "Nova")
 * - For other agents: returns capitalized agent name (e.g., "Ana", "Bill")
 *
 * @param agentName - Internal agent name (e.g., "ralph", "ana", "bill")
 * @returns Visual display name for UI
 */
export function getAgentVisualName(agentName: string): string {
  if (agentName === 'ralph') {
    return getRalphDisplayName();
  }
  // Capitalize first letter for other agents
  return agentName.charAt(0).toUpperCase() + agentName.slice(1);
}

/**
 * Get visual display name for an agent based on session
 * - For Ralph: uses the session name suffix (e.g., agent-ralph-ziggy -> "Ziggy")
 * - For team agents: capitalizes the agent name (e.g., ana -> "Ana")
 *
 * @param agentName - Internal agent name
 * @param ralphName - For Ralph sessions, the name suffix (e.g., "ziggy" from agent-ralph-ziggy)
 */
export function getAgentDisplayNameForUI(
  agentName: string,
  ralphName?: string
): string {
  if (agentName === 'ralph' && ralphName) {
    // Ralph sessions use their name suffix as display name
    return ralphName.charAt(0).toUpperCase() + ralphName.slice(1);
  }

  return getAgentVisualName(agentName);
}
