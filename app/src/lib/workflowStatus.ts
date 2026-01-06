/**
 * Workflow Status Computation
 *
 * Computes agent status based on project files and dependency tree.
 *
 * Dependency Graph:
 *   Dan ──▶ Ana ──▶ Bill ──▶ Enzo ──▶ Carl ──▶ Enzo ──▶ Done
 *           │        │        │        │        │
 *           ▼        ▼        ▼        ▼        ▼
 *        context  research   plan   qa-review progress
 *                                    (pass 1)  qa-review
 *                                              (pass 2)
 *
 * Key concepts:
 * - Phase: The current workflow step (0-5)
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
} from '../types';
import {
  AGENT_WORKFLOW_ROLE,
  WORKFLOW_PHASES,
  AGENT_DEPENDENCIES,
} from '../types';

// Map workflow files to the agent that produces them
const FILE_TO_AGENT: Record<WorkflowFile, AgentName> = {
  'context': 'dan',
  'research': 'ana',
  'plan': 'bill',
  'qa-review': 'enzo',
  'progress': 'carl',
};

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
 * Check if a workflow file exists in the project
 */
function hasFile(existingFiles: string[], fileKey: WorkflowFile): boolean {
  return existingFiles.some(f => f.includes(fileKey));
}

/**
 * Determine the current workflow phase based on existing files.
 *
 * Phase progression:
 *   0: No files (need context.md)
 *   1: context exists (need research.md)
 *   2: research exists (need plan.md)
 *   3: plan exists (need qa-review.md for plan)
 *   4: qa-review exists (need progress.md)
 *   5: progress exists (need final qa-review.md)
 *   6: Complete (all files exist, final QA done)
 *
 * Note: We detect QA pass by checking if progress.md exists alongside qa-review.md
 */
function getCurrentPhase(existingFiles: string[]): number {
  const hasContext = hasFile(existingFiles, 'context');
  const hasResearch = hasFile(existingFiles, 'research');
  const hasPlan = hasFile(existingFiles, 'plan');
  const hasQaReview = hasFile(existingFiles, 'qa-review');
  const hasProgress = hasFile(existingFiles, 'progress');

  // Work backwards from completion
  if (hasProgress && hasQaReview) {
    // Both progress and qa-review exist - could be phase 5 or 6
    // Phase 6 means QA reviewed progress (we'd need timestamp checking for precision)
    // For now, if progress exists with qa-review, assume QA pass 2 is needed/done
    return 5;
  }
  if (hasProgress) {
    // Progress exists but no qa-review for it yet
    return 5;
  }
  if (hasQaReview) {
    // QA review exists (for plan), Carl can now implement
    return 4;
  }
  if (hasPlan) {
    // Plan exists, needs QA review
    return 3;
  }
  if (hasResearch) {
    // Research exists, Bill can plan
    return 2;
  }
  if (hasContext) {
    // Context exists, Ana can research
    return 1;
  }
  // No files yet
  return 0;
}

/**
 * Get phase information from phase number
 */
function getPhaseInfo(phase: number): { owner: AgentName | null; name: string } {
  if (phase >= 0 && phase < WORKFLOW_PHASES.length) {
    const p = WORKFLOW_PHASES[phase];
    return { owner: p.owner, name: p.name };
  }
  return { owner: null, name: 'COMPLETE' };
}

// =============================================================================
// DEPENDENCY RESOLUTION
// =============================================================================

/**
 * Get Enzo's required file based on current phase.
 * Enzo has two QA passes:
 *   - Pass 1 (phase 3): Review plan.md
 *   - Pass 2 (phase 5): Review progress.md
 */
function getEnzoRequiredFile(existingFiles: string[]): WorkflowFile {
  const hasProgress = hasFile(existingFiles, 'progress');

  // If progress exists, Enzo needs to review it (pass 2)
  if (hasProgress) {
    return 'progress';
  }
  // Otherwise Enzo needs to review plan (pass 1)
  return 'plan';
}

/**
 * Determine which QA pass Enzo is on
 */
function getEnzoQAPass(existingFiles: string[]): 1 | 2 | null {
  const hasPlan = hasFile(existingFiles, 'plan');
  const hasProgress = hasFile(existingFiles, 'progress');
  const hasQaReview = hasFile(existingFiles, 'qa-review');

  if (hasProgress) {
    return 2; // Reviewing or done reviewing progress
  }
  if (hasPlan && !hasQaReview) {
    return 1; // Needs to review plan
  }
  if (hasPlan && hasQaReview && !hasProgress) {
    return 1; // Done with pass 1, waiting for Carl
  }
  return null;
}

/**
 * Find missing dependency for an agent, with phase awareness for Enzo
 */
function findMissingDependency(
  agentName: AgentName,
  existingFiles: string[]
): { file: WorkflowFile; agent: AgentName } | null {
  // Special handling for Enzo (dual-phase QA)
  if (agentName === 'enzo') {
    const requiredFile = getEnzoRequiredFile(existingFiles);
    if (!hasFile(existingFiles, requiredFile)) {
      return {
        file: requiredFile,
        agent: FILE_TO_AGENT[requiredFile],
      };
    }
    return null;
  }

  // Standard dependency check for other agents
  const role = AGENT_WORKFLOW_ROLE[agentName];

  for (const requiredFile of role.requires) {
    if (!hasFile(existingFiles, requiredFile)) {
      return {
        file: requiredFile,
        agent: FILE_TO_AGENT[requiredFile],
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
function determinePhaseOwner(phase: number): AgentName | null {
  if (phase >= 0 && phase < WORKFLOW_PHASES.length) {
    return WORKFLOW_PHASES[phase].owner;
  }
  return null;
}

/**
 * Get agents waiting on a specific agent's output
 */
function getWaitingOnMe(
  agentName: AgentName,
  existingFiles: string[]
): AgentName[] {
  const waiting: AgentName[] = [];
  const downstream = AGENT_DEPENDENCIES[agentName].downstream;

  for (const dependentAgent of downstream) {
    // Check if this dependent agent is actually blocked by us
    const missingDep = findMissingDependency(dependentAgent, existingFiles);
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
  waitingOnMe: AgentName[]
): TurnCategory {
  // Free agents and coordinator
  if (agentName === 'ralph') {
    return 'not_involved';
  }

  // Dan is coordinator, always available but not "next up" in workflow sense
  if (agentName === 'dan') {
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
  existingFiles: string[],
  isStreaming: boolean,
  hasMessages: boolean
): AgentWorkflowState {
  const agentName = agent.name as AgentName;
  const role = AGENT_WORKFLOW_ROLE[agentName];
  const currentPhase = getCurrentPhase(existingFiles);
  const phaseInfo = getPhaseInfo(currentPhase);
  const phaseOwner = determinePhaseOwner(currentPhase);

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
    const missingDep = findMissingDependency(agentName, existingFiles);

    if (missingDep) {
      status = 'blocked';
      blockedBy = missingDep.agent;
      blockedByFile = missingDep.file;
      canStart = false;
    }
    // 5. Check if agent's output already exists (they're done or in QA)
    else if (role.produces && hasFile(existingFiles, role.produces)) {
      // Special case for Enzo - check which QA pass we're on
      if (agentName === 'enzo') {
        const pass = getEnzoQAPass(existingFiles);
        qaPass = pass;
        // Enzo is "complete" when progress has been reviewed
        if (pass === 2 && hasFile(existingFiles, 'qa-review')) {
          status = 'complete';
        } else if (pass === 1 && hasFile(existingFiles, 'qa-review')) {
          // Pass 1 done, waiting for Carl
          status = 'complete';
        } else {
          status = 'ready';
        }
      }
      // Check if output is awaiting QA (for Bill and Carl)
      else if (role.produces === 'plan') {
        // Bill's plan needs QA - blocked by Enzo
        if (!hasFile(existingFiles, 'qa-review')) {
          status = 'blocked';
          awaitingQA = true;
          blockedBy = 'enzo';
        } else {
          status = 'complete';
        }
      } else if (role.produces === 'progress') {
        // Carl's progress needs final QA - blocked by Enzo
        status = 'blocked';
        awaitingQA = true;
        blockedBy = 'enzo';
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

  // Special case: Dan is the coordinator
  if (agentName === 'dan') {
    if (agent.active && agent.current_project && agent.current_project !== 'VIBING') {
      status = isStreaming ? 'working' : (hasMessages ? 'waiting_input' : 'ready');
    }
    blockedBy = null;
    blockedByFile = null;
  }

  // Special case: Ralph is a free agent
  if (agentName === 'ralph') {
    if (agent.active) {
      status = isStreaming ? 'working' : (hasMessages ? 'waiting_input' : 'idle');
    }
    blockedBy = null;
    blockedByFile = null;
  }

  // Calculate who is waiting on this agent
  const waitingOnMe = getWaitingOnMe(agentName, existingFiles);

  // Determine turn category
  const turnCategory = determineTurnCategory(
    agentName,
    status,
    isNextUp,
    waitingOnMe
  );

  // Get Enzo's QA pass if applicable
  if (agentName === 'enzo') {
    qaPass = getEnzoQAPass(existingFiles);
  }

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
    totalPhases: 6,
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
  getCurrentPhase,
  getPhaseInfo,
  getEnzoRequiredFile,
  getEnzoQAPass,
  findMissingDependency,
  determinePhaseOwner,
  getWaitingOnMe,
  determineTurnCategory,
};
