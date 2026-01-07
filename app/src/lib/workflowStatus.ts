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
  TeamConfig,
} from '../types';
import type { FileCompletion } from '../types/projects';
import {
  AGENT_WORKFLOW_ROLE,
  WORKFLOW_PHASES,
  AGENT_DEPENDENCIES,
} from '../types';

// Legacy constant for backward compatibility (will be removed after migration)
// TODO: Replace with dynamic mapping from team.team.workflow.phases
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
 * Check if a workflow file is completed (has HANDOFF marker)
 * Falls back to checking existence if FileCompletion[] is not provided
 */
function hasFile(files: string[] | FileCompletion[], fileKey: WorkflowFile): boolean {
  if (files.length === 0) return false;

  // Check if it's FileCompletion[] (has 'completed' property)
  if (typeof files[0] === 'object' && 'completed' in files[0]) {
    const completions = files as FileCompletion[];
    const fileCompletion = completions.find(f => f.file.includes(fileKey));
    return fileCompletion?.completed ?? false;
  }

  // Fallback: string[] - just check existence (backwards compatibility)
  const existingFiles = files as string[];
  return existingFiles.some(f => f.includes(fileKey));
}

/**
 * Check if a workflow file exists (regardless of completion status)
 */
function hasFileExists(files: string[] | FileCompletion[], fileKey: WorkflowFile): boolean {
  if (files.length === 0) return false;

  // Check if it's FileCompletion[]
  if (typeof files[0] === 'object' && 'exists' in files[0]) {
    const completions = files as FileCompletion[];
    const fileCompletion = completions.find(f => f.file.includes(fileKey));
    return fileCompletion?.exists ?? false;
  }

  // Fallback: string[] - just check existence
  const existingFiles = files as string[];
  return existingFiles.some(f => f.includes(fileKey));
}

/**
 * Determine the current workflow phase based on completed files (HANDOFF markers).
 *
 * Phase progression (5 phases, matching 5 workflow files):
 *   0: No files completed (need context.md)
 *   1: context completed (need research.md)
 *   2: research completed (need plan.md)
 *   3: plan completed (need qa-review.md)
 *   4: qa-review completed (need progress.md)
 *   5: All complete (progress.md completed)
 *
 * Note: Completion is determined by HANDOFF markers, not just file existence.
 */
function getCurrentPhase(files: string[] | FileCompletion[]): number {
  const hasContext = hasFile(files, 'context');
  const hasResearch = hasFile(files, 'research');
  const hasPlan = hasFile(files, 'plan');
  const hasQaReview = hasFile(files, 'qa-review');
  const hasProgress = hasFile(files, 'progress');

  // Count completed phases
  if (hasProgress) return 5;  // All complete
  if (hasQaReview) return 4;  // QA review done, need progress
  if (hasPlan) return 3;      // Plan done, need QA review
  if (hasResearch) return 2;  // Research done, need plan
  if (hasContext) return 1;   // Context done, need research
  return 0;                   // No files completed yet
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
function getEnzoRequiredFile(files: string[] | FileCompletion[]): WorkflowFile {
  const hasProgress = hasFileExists(files, 'progress');

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
function getEnzoQAPass(files: string[] | FileCompletion[]): 1 | 2 | null {
  const hasPlan = hasFileExists(files, 'plan');
  const hasProgress = hasFileExists(files, 'progress');
  const hasQaReview = hasFileExists(files, 'qa-review');

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
  files: string[] | FileCompletion[]
): { file: WorkflowFile; agent: AgentName } | null {
  // Special handling for Enzo (dual-phase QA)
  if (agentName === 'enzo') {
    const requiredFile = getEnzoRequiredFile(files);
    if (!hasFile(files, requiredFile)) {
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
    if (!hasFile(files, requiredFile)) {
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
  files: string[] | FileCompletion[]
): AgentName[] {
  const waiting: AgentName[] = [];
  const downstream = AGENT_DEPENDENCIES[agentName].downstream;

  for (const dependentAgent of downstream) {
    // Check if this dependent agent is actually blocked by us
    const missingDep = findMissingDependency(dependentAgent, files);
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
  const role = AGENT_WORKFLOW_ROLE[agentName];
  const currentPhase = getCurrentPhase(files);
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
    const missingDep = findMissingDependency(agentName, files);

    if (missingDep) {
      status = 'blocked';
      blockedBy = missingDep.agent;
      blockedByFile = missingDep.file;
      canStart = false;
    }
    // 5. Check if agent's output already exists (they're done or in QA)
    else if (role.produces && hasFile(files, role.produces)) {
      // Check if this agent has multi-pass QA (e.g., Enzo)
      const currentAgentConfig = team.team.agents.find(a => a.name === agentName);
      if (currentAgentConfig?.qa_passes && currentAgentConfig.qa_passes > 1) {
        const pass = getEnzoQAPass(files);
        qaPass = pass;
        // Complete when final pass is done
        if (pass !== null && pass === currentAgentConfig.qa_passes && hasFile(files, 'qa-review')) {
          status = 'complete';
        } else if (pass !== null && pass > 0 && hasFile(files, 'qa-review')) {
          // Intermediate pass done, waiting for next phase
          status = 'complete';
        } else {
          status = 'ready';
        }
      }
      // Check if output is awaiting QA (agents with awaits_qa: true)
      else if (currentAgentConfig?.awaits_qa) {
        // Find QA agent in team config
        const qaAgent = team.team.agents.find(a => a.qa_passes && a.qa_passes > 0);
        const qaAgentName = qaAgent?.name || 'enzo'; // Fallback to 'enzo' for backward compat

        if (!hasFile(files, 'qa-review')) {
          status = 'blocked';
          awaitingQA = true;
          blockedBy = qaAgentName as AgentName;
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
  const waitingOnMe = getWaitingOnMe(agentName, files);

  // Determine turn category
  const turnCategory = determineTurnCategory(
    agentName,
    status,
    isNextUp,
    waitingOnMe,
    team
  );

  // Get QA pass for agents with multi-pass QA (e.g., Enzo)
  if (agentConfigForSpecialCases?.qa_passes && agentConfigForSpecialCases.qa_passes > 1) {
    qaPass = getEnzoQAPass(files);  // TODO: Generalize this for any multi-pass QA agent
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
    totalPhases: 5,  // 5 workflow files: context, research, plan, qa-review, progress
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
  getEnzoRequiredFile,
  getEnzoQAPass,
  findMissingDependency,
  determinePhaseOwner,
  getWaitingOnMe,
  determineTurnCategory,
};
