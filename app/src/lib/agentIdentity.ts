/**
 * Agent Identity System
 *
 * Provides visual display names for agents. The "ralph" agent is internally
 * called "ralph" but visually displays as a random fun name from a curated list.
 */

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
  // Check localStorage for existing assignment
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && AGENT_DISPLAY_NAMES.includes(stored as AgentDisplayName)) {
    return stored as AgentDisplayName;
  }

  // Assign a new random name and persist it
  const newName = getRandomDisplayName();
  localStorage.setItem(STORAGE_KEY, newName);
  return newName;
}

/**
 * Reset ralph's display name to a new random value
 * Useful if user wants a different name
 */
export function resetRalphDisplayName(): AgentDisplayName {
  const newName = getRandomDisplayName();
  localStorage.setItem(STORAGE_KEY, newName);
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
 * Get visual display name for a spawned agent instance
 * - For ralph spawned instances: the instanceId IS the display name (already a fun name)
 * - For ralph core agent: returns the assigned fun name
 * - For other spawned agents: returns "AgentName-InstanceNum" (e.g., "Ana-2")
 * - For other core agents: returns capitalized name
 *
 * @param agentName - Internal agent name
 * @param instanceId - Instance identifier (e.g., "2", "ziggy")
 * @param isCoreAgent - Whether this is a core agent (not spawned)
 */
export function getAgentDisplayNameForUI(
  agentName: string,
  instanceId?: string,
  isCoreAgent: boolean = false
): string {
  // For spawned instances
  if (instanceId) {
    const isNumeric = /^\d+$/.test(instanceId);

    if (agentName === 'ralph') {
      // Ralph spawned instances use their instanceId as display name (already a fun name)
      return instanceId.charAt(0).toUpperCase() + instanceId.slice(1);
    }

    if (isNumeric) {
      // Other agents with numeric IDs: "Ana-2"
      return agentName.charAt(0).toUpperCase() + agentName.slice(1) + '-' + instanceId;
    }

    // Non-numeric instanceId (edge case): just capitalize it
    return instanceId.charAt(0).toUpperCase() + instanceId.slice(1);
  }

  // For core agents
  if (isCoreAgent || !instanceId) {
    return getAgentVisualName(agentName);
  }

  return agentName.charAt(0).toUpperCase() + agentName.slice(1);
}
