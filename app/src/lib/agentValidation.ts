import { useTeamStore } from '../store/teamStore';
import type { AgentName, AgentConfig } from '../types';

/**
 * Validate that a string is a valid agent name in the current team
 */
export function validateAgentName(name: string): boolean {
  const team = useTeamStore.getState().currentTeam;
  if (!team) return false;
  return team.team.agents.some(a => a.name === name);
}

/**
 * Assert that a string is a valid agent name (throws if invalid)
 */
export function assertValidAgent(name: string): asserts name is AgentName {
  if (!validateAgentName(name)) {
    throw new Error(`Invalid agent name: ${name}`);
  }
}

/**
 * Get agent config by name (throws if not found)
 */
export function getAgentOrThrow(name: string): AgentConfig {
  const team = useTeamStore.getState().currentTeam;
  if (!team) {
    throw new Error('No team loaded');
  }

  const agent = team.team.agents.find(a => a.name === name);
  if (!agent) {
    throw new Error(`Agent '${name}' not found in team '${team.team.name}'`);
  }
  return agent;
}

/**
 * Safely get agent config (returns null if not found)
 */
export function getAgent(name: string): AgentConfig | null {
  const team = useTeamStore.getState().currentTeam;
  if (!team) return null;
  return team.team.agents.find(a => a.name === name) || null;
}

/**
 * Get all workflow participants from current team
 */
export function getWorkflowParticipants(): string[] {
  const team = useTeamStore.getState().currentTeam;
  if (!team) return [];
  return team.team.agents
    .filter(a => a.workflow_participant)
    .map(a => a.name);
}

/**
 * Get the note-taker agent name from current team
 */
export function getNoteTaker(): string | null {
  const team = useTeamStore.getState().currentTeam;
  if (!team) return null;
  return team.team.workflow.note_taker ?? null;
}

/**
 * Check if an agent is a workflow participant
 */
export function isWorkflowParticipant(name: string): boolean {
  const agent = getAgent(name);
  return agent?.workflow_participant ?? false;
}

/**
 * Check if an agent is the note-taker
 */
export function isNoteTaker(name: string): boolean {
  const noteTaker = getNoteTaker();
  return noteTaker === name;
}
