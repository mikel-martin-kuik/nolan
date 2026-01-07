/**
 * Workflow Status Computation
 *
 * Computes agent status based on project files and dependency tree.
 *
 * Dependency Graph:
 *   Dan ──▶ Ana ──▶ Bill ──▶ Enzo ──▶ Carl ──▶ Frank ──▶ Done
 *           │        │        │        │        │
 *           ▼        ▼        ▼        ▼        ▼
 *        context  research   plan  plan-review progress
 *                                              implementation-audit
 *
 * Key concepts:
 * - Phase: The current workflow step (0-6)
 * - Phase Owner: The agent responsible for the current phase
 * - isNextUp: True if this agent is the phase owner
 * - waitingOnMe: Agents blocked waiting for this agent's output
 * - turnCategory: UI grouping (your_turn, waiting_on_you, waiting_on_other, done, not_involved)
 */

import type {
  AgentStatus,
  AgentName,
  WorkflowStatus,
  WorkflowFile,
  AgentWorkflowState,
  TurnCategory,
  TeamConfig,
} from '../types';
import type { FileCompletion } from '../types/projects';
import {
  getWorkflowPhases,
  getAgentDependencies,
  getAgentWorkflowRole,
  getFileToAgent,
} from '../types';

// Status display configuration
const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string }> = {
  offline: { label: 'Offline', color: 'bg-muted-foreground/40' },
  idle: { label: 'Idle', color: 'bg-zinc-500' },
  working: { label: 'Working', color: 'bg-green-500' },
  waiting_input: { label: 'Needs Input', color: 'bg-yellow-500' },
  blocked: { label: 'Blocked', color: 'bg-red-500' },
  ready: { label: 'Ready', color: 'bg-blue-500' },
  complete: { label: 'Complete', color: 'bg-teal-500' },
};

// =============================================================================
// FILE & PHASE DETECTION
// =============================================================================

/**
 * Check if a workflow file is completed (has HANDOFF marker)
 * Falls back to checking existence if FileCompletion[] is not provided
 */
function hasFile(files: string[] | FileCompletion[], fileKey: WorkflowFile): boolean {
  if (files.length === 0) return false;

  // Check if it's FileCompletion[] (has 'completed' property)
  if (typeof files[0] === 'object' && 'completed' in files[0]) {
    const completions = files as FileCompletion[];
    const fileCompletion = completions.find(f => f.file === `${fileKey}.md` || f.file === fileKey);
    return fileCompletion?.completed ?? false;
  }

  // Fallback: string[] - just check existence (backwards compatibility)
  const existingFiles = files as string[];
  return existingFiles.some(f => f === `${fileKey}.md` || f === fileKey);
}

/**
 * Check if a workflow file exists (regardless of completion status)
 */
function hasFileExists(files: string[] | FileCompletion[], fileKey: WorkflowFile): boolean {
  if (files.length === 0) return false;

  // Check if it's FileCompletion[]
  if (typeof files[0] === 'object' && 'exists' in files[0]) {
    const completions = files as FileCompletion[];
    const fileCompletion = completions.find(f => f.file === `${fileKey}.md` || f.file === fileKey);
    return fileCompletion?.exists ?? false;
  }

  // Fallback: string[] - just check existence
  const existingFiles = files as string[];
  return existingFiles.some(f => f === `${fileKey}.md` || f === fileKey);
}

/**
 * Determine the current workflow phase based on completed files (HANDOFF markers).
 *
 * Dynamic phase progression based on team config:
 *   0: No files completed (need context.md)
 *   1..N: Each phase completed in order from team.workflow.phases
 *   N+1: All phases complete
 *
 * Note: Completion is determined by HANDOFF markers, not just file existence.
 */
function getCurrentPhase(files: string[] | FileCompletion[], team: TeamConfig | null): number {
  // First check if context is complete (prerequisite for all phases)
  if (!hasFile(files, 'context')) {
    return 0;
  }

  // Validate team config exists
  if (!team) {
    console.warn('getCurrentPhase: team config is null, defaulting to phase 1');
    return 1;
  }

  // Get phases from team config
  const phases = getWorkflowPhases(team);
  if (phases.length === 0) {
    // Fallback for no phases - return 1 if context exists
    return 1;
  }

  // Count completed phases by checking each phase's output file
  let completedPhases = 0;
  for (const phase of phases) {
    if (hasFile(files, phase.file)) {
      completedPhases++;
    } else {
      // Phases must be completed in order, stop at first incomplete
      break;
    }
  }

  // Phase 0 = no context, Phase 1 = context done, Phase 2+ = phases completed
  return completedPhases + 1;
}

/**
 * Get phase information from phase number
 */
function getPhaseInfo(phase: number, team: TeamConfig | null): { owner: AgentName | null; name: string } {
  const phases = getWorkflowPhases(team);
  if (phase >= 0 && phase < phases.length) {
    const p = phases[phase];
    return { owner: p.owner, name: p.name };
  }
  return { owner: null, name: 'COMPLETE' };
}

// =============================================================================
// DEPENDENCY RESOLUTION
// =============================================================================

/**
 * Find missing dependency for an agent
 */
function findMissingDependency(
  agentName: AgentName,
  files: string[] | FileCompletion[],
  team: TeamConfig | null
): { file: WorkflowFile; agent: AgentName } | null {
  // Standard dependency check for all agents
  const role = getAgentWorkflowRole(team, agentName);
  const fileToAgent = getFileToAgent(team);

  for (const requiredFile of role.requires) {
    if (!hasFile(files, requiredFile)) {
      return {
        file: requiredFile,
        agent: fileToAgent[requiredFile] ?? 'unknown',
      };
    }
  }

  return null;
}

// =============================================================================
// TURN & DEPENDENCY TRACKING
// =============================================================================

/**
 * Determine who should be working based on current phase
 */
function determinePhaseOwner(phase: number, team: TeamConfig | null): AgentName | null {
  const phases = getWorkflowPhases(team);
  if (phase >= 0 && phase < phases.length) {
    return phases[phase].owner;
  }
  return null;
}

/**
 * Get agents waiting on a specific agent's output
 */
function getWaitingOnMe(
  agentName: AgentName,
  files: string[] | FileCompletion[],
  team: TeamConfig | null
): AgentName[] {
  const waiting: AgentName[] = [];
  const dependencies = getAgentDependencies(team);
  const downstream = dependencies[agentName]?.downstream ?? [];

  for (const dependentAgent of downstream) {
    // Check if this dependent agent is actually blocked by us
    const missingDep = findMissingDependency(dependentAgent, files, team);
    if (missingDep && missingDep.agent === agentName) {
      waiting.push(dependentAgent);
    }
  }

  return waiting;
}

/**
 * Determine turn category for UI grouping
 */
function determineTurnCategory(
  agentName: AgentName,
  status: WorkflowStatus,
  isNextUp: boolean,
  waitingOnMe: AgentName[],
  team: TeamConfig
): TurnCategory {
  // Check if agent is a workflow participant
  const agentConfig = team.team.agents.find(a => a.name === agentName);
  if (!agentConfig?.workflow_participant) {
    return 'not_involved';
  }

  // Check if agent is the coordinator (not in workflow but manages it)
  if (agentName === team.team.workflow.coordinator) {
    return 'not_involved';
  }

  // Offline or idle agents
  if (status === 'offline' || status === 'idle') {
    return 'not_involved';
  }

  // Completed agents
  if (status === 'complete') {
    return 'done';
  }

  // Check if it's this agent's turn (they are the phase owner)
  if (isNextUp) {
    return 'your_turn';
  }

  // Check if someone is waiting on this agent
  if (waitingOnMe.length > 0) {
    return 'waiting_on_you';
  }

  // Agent is blocked waiting on someone else
  if (status === 'blocked') {
    return 'waiting_on_other';
  }

  // Agent has finished their part but workflow continues

  return 'not_involved';
}

// =============================================================================
// MAIN STATE COMPUTATION
// =============================================================================

/**
 * Compute workflow state for an agent based on project files and activity
 */
export function computeWorkflowState(
  agent: AgentStatus,
  files: string[] | FileCompletion[],
  isStreaming: boolean,
  hasMessages: boolean,
  team: TeamConfig
): AgentWorkflowState {
  const agentName = agent.name as AgentName;
  const role = getAgentWorkflowRole(team, agentName);
  const dependencies = getAgentDependencies(team);
  const currentPhase = getCurrentPhase(files, team);
  const phaseInfo = getPhaseInfo(currentPhase, team);
  const phaseOwner = determinePhaseOwner(currentPhase, team);

  // Default state
  let status: WorkflowStatus = 'idle';
  let blockedBy: AgentName | null = null;
  let blockedByFile: WorkflowFile | null = null;
  let canStart = true;
  let awaitingQA = false;
  let qaPass: 1 | 2 | null = null;

  // Determine if this agent is "next up"
  const isNextUp = phaseOwner === agentName;

  // 1. Check if agent is offline
  if (!agent.active) {
    status = 'offline';
    canStart = false;
  }
  // 2. Check if agent is actively working
  else if (isStreaming) {
    status = 'working';
  }
  // 3. Check if agent has no project assigned
  else if (!agent.current_project || agent.current_project === 'VIBING') {
    status = 'idle';
    canStart = false;
  }
  // 4. Check for blocked state (missing dependencies)
  else {
    const missingDep = findMissingDependency(agentName, files, team);

    if (missingDep) {
      status = 'blocked';
      blockedBy = missingDep.agent;
      blockedByFile = missingDep.file;
      canStart = false;
    }
    // 5. Check if agent's output already exists (they're done or awaiting review)
    else if (role.produces && hasFile(files, role.produces)) {
      // Check if output is awaiting review (agents with awaits_qa: true)
      const currentAgentConfig = team.team.agents.find(a => a.name === agentName);
      if (currentAgentConfig?.awaits_qa) {
        // Check if downstream reviewer has completed their file
        const downstream = dependencies[agentName]?.downstream ?? [];
        if (downstream.length > 0) {
          const reviewerAgent = downstream[0] as AgentName;
          const reviewerRole = getAgentWorkflowRole(team, reviewerAgent);
          if (reviewerRole.produces && !hasFile(files, reviewerRole.produces)) {
            status = 'blocked';
            awaitingQA = true;
            blockedBy = reviewerAgent;
          } else {
            status = 'complete';
          }
        } else {
          status = 'complete';
        }
      } else {
        status = 'complete';
      }
    }
    // 6. Agent is ready to work (has project, deps met, no output yet)
    else if (hasMessages) {
      // Has messages but not streaming - likely waiting for input
      status = 'waiting_input';
    } else {
      status = 'ready';
    }
  }

  // Special case: Coordinator agent (e.g., Dan)
  if (agentName === team.team.workflow.coordinator) {
    if (agent.active && agent.current_project && agent.current_project !== 'VIBING') {
      status = isStreaming ? 'working' : (hasMessages ? 'waiting_input' : 'ready');
    }
    blockedBy = null;
    blockedByFile = null;
  }

  // Get agent config for special case handling
  const agentConfigForSpecialCases = team.team.agents.find(a => a.name === agentName);

  // Special case: Non-workflow participants (free agents like Ralph)
  if (!agentConfigForSpecialCases?.workflow_participant) {
    if (agent.active) {
      status = isStreaming ? 'working' : (hasMessages ? 'waiting_input' : 'idle');
    }
    blockedBy = null;
    blockedByFile = null;
  }

  // Calculate who is waiting on this agent
  const waitingOnMe = getWaitingOnMe(agentName, files, team);

  // Determine turn category
  const turnCategory = determineTurnCategory(
    agentName,
    status,
    isNextUp,
    waitingOnMe,
    team
  );

  const config = STATUS_CONFIG[status];

  return {
    // Current status
    status,

    // Dependency info
    blockedBy,
    blockedByFile,

    // Turn tracking
    isNextUp,
    waitingOnMe,
    turnCategory,

    // Phase tracking
    currentPhase,
    totalPhases: getWorkflowPhases(team).length + 1,  // context + phase outputs
    phaseOwner,
    phaseName: phaseInfo.name,

    // QA awareness
    awaitingQA,
    qaPass,

    // UI hints
    canStart,
    statusLabel: config.label,
    statusColor: config.color,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get a human-readable blocker message
 */
export function getBlockerMessage(state: AgentWorkflowState): string | null {
  if (state.status !== 'blocked' || !state.blockedBy || !state.blockedByFile) {
    return null;
  }

  return `Waiting: ${state.blockedBy} (${state.blockedByFile}.md)`;
}

/**
 * Get a human-readable turn message
 */
export function getTurnMessage(state: AgentWorkflowState): string | null {
  switch (state.turnCategory) {
    case 'your_turn':
      return 'Your turn';
    case 'waiting_on_you':
      return `${state.waitingOnMe.join(', ')} waiting`;
    case 'waiting_on_other':
      return state.blockedBy ? `Waiting on ${state.blockedBy}` : 'Waiting';
    case 'done':
      return 'Done';
    case 'not_involved':
    default:
      return null;
  }
}

/**
 * Sort priority - determines display order
 * Priority: waiting_input > working > blocked > ready > complete > idle > offline
 */
const STATUS_PRIORITY: Record<WorkflowStatus, number> = {
  waiting_input: 0,  // Needs attention first
  working: 1,        // Actively working
  blocked: 2,        // Blocked by others
  ready: 3,          // Ready to start
  complete: 4,       // Done
  idle: 5,           // No project
  offline: 6,        // Not running
};

/**
 * Turn category priority for secondary sorting
 */
const TURN_PRIORITY: Record<TurnCategory, number> = {
  your_turn: 0,        // Should be working NOW
  waiting_on_you: 1,   // Someone blocked on you
  waiting_on_other: 2, // You're blocked
  done: 3,             // Finished
  not_involved: 4,     // Not in workflow
};

export function sortByWorkflowPriority(
  a: { state: AgentWorkflowState },
  b: { state: AgentWorkflowState }
): number {
  // Primary sort by status
  const statusDiff = STATUS_PRIORITY[a.state.status] - STATUS_PRIORITY[b.state.status];
  if (statusDiff !== 0) return statusDiff;

  // Secondary sort by turn category
  return TURN_PRIORITY[a.state.turnCategory] - TURN_PRIORITY[b.state.turnCategory];
}

/**
 * Group agents by their workflow status for display
 */
export type WorkflowGroup = 'attention' | 'active' | 'blocked' | 'idle';

export function getWorkflowGroup(status: WorkflowStatus): WorkflowGroup {
  switch (status) {
    case 'waiting_input':
      return 'attention';
    case 'working':
    case 'ready':
      return 'active';
    case 'blocked':
      return 'blocked';
    case 'idle':
    case 'offline':
    case 'complete':
    default:
      return 'idle';
  }
}

/**
 * Get workflow group by turn category (alternative grouping)
 */
export type TurnGroup = 'action_needed' | 'in_progress' | 'waiting' | 'finished' | 'inactive';

export function getTurnGroup(turnCategory: TurnCategory, status: WorkflowStatus): TurnGroup {
  if (status === 'offline' || status === 'idle') {
    return 'inactive';
  }

  switch (turnCategory) {
    case 'your_turn':
    case 'waiting_on_you':
      return 'action_needed';
    case 'waiting_on_other':
      return 'waiting';
    case 'done':
      return 'finished';
    case 'not_involved':
    default:
      return status === 'working' ? 'in_progress' : 'inactive';
  }
}

// =============================================================================
// EXPORTS FOR EXTERNAL USE
// =============================================================================

export {
  hasFile,
  hasFileExists,
  getCurrentPhase,
  getPhaseInfo,
  findMissingDependency,
  determinePhaseOwner,
  getWaitingOnMe,
  determineTurnCategory,
};
