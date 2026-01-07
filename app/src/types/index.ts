// Agent and session types matching Rust backend structures

export interface AgentStatus {
  name: string;
  active: boolean;
  session: string;
  attached: boolean;
  context_usage?: number;  // Context window usage percentage (0-100)
  current_project?: string;  // Current project from statusline (undefined if VIBING)
  created_at?: number;  // Unix timestamp in milliseconds (for spawned agents)
}

export interface AgentStatusList {
  core: AgentStatus[];
  spawned: AgentStatus[];  // Changed from string[] to AgentStatus[]
}

// Team configuration types matching Rust backend
export type AgentName = string;

export interface TeamConfig {
  team: {
    name: string;
    description?: string;
    version?: string;
    agents: AgentConfig[];
    workflow: WorkflowConfig;
    communication: CommunicationConfig;
  };
}

export interface AgentConfig {
  name: string;
  role: string;
  model: string;
  color?: string;
  output_file: string | null;
  required_sections: string[];
  file_permissions: 'restricted' | 'permissive' | 'no_projects';
  workflow_participant: boolean;
  awaits_qa?: boolean;
  qa_passes?: number;
  multi_instance?: boolean;
  max_instances?: number;
  instance_names?: string[];
}

export interface WorkflowConfig {
  coordinator: string;
  phases: PhaseConfig[];
}

export interface PhaseConfig {
  name: string;
  owner: string;
  output: string;
  requires: string[];
  template?: string;
}

export interface CommunicationConfig {
  broadcast_groups: BroadcastGroup[];
}

export interface BroadcastGroup {
  name: string;
  pattern: string;
  members: string[];
}

// Dynamic agent metadata (populated from team config at runtime)
export let AGENT_DESCRIPTIONS: Record<string, string> = {};
export let AGENT_COLORS: Record<string, string> = {};
export let AGENT_TEXT_COLORS: Record<string, string> = {};

export function updateAgentDescriptions(team: TeamConfig) {
  AGENT_DESCRIPTIONS = {};
  for (const agent of team.team.agents) {
    AGENT_DESCRIPTIONS[agent.name] = agent.role;
  }
}

export function updateAgentColors(team: TeamConfig) {
  const defaultColors = ['#a855f7', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#71717a'];
  AGENT_COLORS = {};
  AGENT_TEXT_COLORS = {};

  team.team.agents.forEach((agent, i) => {
    const color = agent.color || defaultColors[i % defaultColors.length];
    AGENT_COLORS[agent.name] = `bg-[${color}]`;
    AGENT_TEXT_COLORS[agent.name] = `text-[${color}]`;
  });
}

// Claude Code model types
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export const CLAUDE_MODELS: { id: ClaudeModel; label: string; hint: string }[] = [
  { id: 'opus', label: 'Opus', hint: 'Powerful' },
  { id: 'sonnet', label: 'Sonnet', hint: 'Balanced' },
  { id: 'haiku', label: 'Haiku', hint: 'Fast' },
];


// History log types
export interface TokenInfo {
  input: number;
  output: number;
}

export interface HistoryEntry {
  uuid?: string;
  timestamp: string;
  agent?: string;
  tmux_session?: string;
  message: string;
  preview: string;
  entry_type: string;
  session_id?: string;
  project?: string;
  tool_name?: string;
  tokens?: TokenInfo;
  is_streaming?: boolean;  // true for real-time entries, false for bulk historical load
}

// =============================================================================
// WORKFLOW STATUS TYPES - Dependency-aware agent status tracking
// =============================================================================

/**
 * Agent workflow status based on project phase and dependencies
 */
export type WorkflowStatus =
  | 'offline'        // Agent process not running
  | 'idle'           // Running, no project assigned
  | 'working'        // Actively producing output (streaming)
  | 'waiting_input'  // Needs human/PO decision
  | 'blocked'        // Waiting on another agent's output
  | 'ready'          // Dependencies met, can start when assigned
  | 'complete';      // Phase complete, handed off

/**
 * Turn category for UI grouping - determines agent priority/visibility
 */
export type TurnCategory =
  | 'your_turn'        // This agent should be working NOW (it's their phase)
  | 'waiting_on_you'   // Another agent is blocked waiting for this agent
  | 'waiting_on_other' // Agent is blocked by someone else
  | 'done'             // Agent completed their phase for this project
  | 'not_involved';    // Dan, Ralph, or not yet their phase

/**
 * Workflow files in order of execution
 */
export const WORKFLOW_FILES = ['context', 'research', 'plan', 'qa-review', 'progress'] as const;
export type WorkflowFile = typeof WORKFLOW_FILES[number];

/**
 * Workflow phase definition
 */
export interface WorkflowPhase {
  phase: number;
  name: string;
  owner: AgentName;
  file: WorkflowFile;
  nextAgent: AgentName | null;
}

/**
 * Workflow dependency tree - the complete dependency graph
 *
 * Workflow Flow:
 *   Dan → Ana → Bill → Enzo → Carl → Enzo → Done
 *         │      │       │      │       │
 *         ▼      ▼       ▼      ▼       ▼
 *      research plan  qa-review progress qa-review
 */
export const WORKFLOW_PHASES: WorkflowPhase[] = [
  { phase: 0, name: 'CONTEXT',     owner: 'dan',  file: 'context',   nextAgent: 'ana' },
  { phase: 1, name: 'RESEARCH',    owner: 'ana',  file: 'research',  nextAgent: 'bill' },
  { phase: 2, name: 'PLANNING',    owner: 'bill', file: 'plan',      nextAgent: 'enzo' },
  { phase: 3, name: 'QA_PLAN',     owner: 'enzo', file: 'qa-review', nextAgent: 'carl' },
  { phase: 4, name: 'IMPLEMENT',   owner: 'carl', file: 'progress',  nextAgent: 'enzo' },
  { phase: 5, name: 'QA_PROGRESS', owner: 'enzo', file: 'qa-review', nextAgent: null },
];

/**
 * Agent dependency relationships
 * - upstream: who this agent waits on (blocks them)
 * - downstream: who waits on this agent (they block)
 */
export const AGENT_DEPENDENCIES: Record<AgentName, {
  upstream: AgentName[];    // Agents that block this agent
  downstream: AgentName[];  // Agents blocked by this agent
}> = {
  dan: {
    upstream: [],              // Dan waits on nobody
    downstream: ['ana'],       // Ana waits on Dan (context)
  },
  ana: {
    upstream: ['dan'],         // Ana waits on Dan
    downstream: ['bill'],      // Bill waits on Ana
  },
  bill: {
    upstream: ['ana'],         // Bill waits on Ana
    downstream: ['enzo', 'carl'], // Enzo and Carl wait on Bill
  },
  enzo: {
    upstream: ['bill', 'carl'], // Enzo waits on Bill OR Carl (phase-dependent)
    downstream: ['carl'],       // Carl waits on Enzo (after QA pass 1)
  },
  carl: {
    upstream: ['bill', 'enzo'], // Carl waits on Bill AND Enzo
    downstream: ['enzo'],       // Enzo waits on Carl (QA pass 2)
  },
  ralph: {
    upstream: [],              // Ralph waits on nobody
    downstream: [],            // Nobody waits on Ralph
  },
};

/**
 * Agent role in the workflow (kept for backward compatibility)
 */
export const AGENT_WORKFLOW_ROLE: Record<AgentName, {
  produces: WorkflowFile | null;
  requires: WorkflowFile[];
  description: string;
}> = {
  dan: {
    produces: 'context',
    requires: [],
    description: 'Coordinates workflow, creates context'
  },
  ana: {
    produces: 'research',
    requires: ['context'],
    description: 'Researches and produces research.md'
  },
  bill: {
    produces: 'plan',
    requires: ['research'],
    description: 'Plans implementation from research'
  },
  enzo: {
    produces: 'qa-review',
    requires: [], // Dynamic: plan OR progress depending on phase
    description: 'Reviews plans and implementations'
  },
  carl: {
    produces: 'progress',
    requires: ['plan', 'qa-review'],
    description: 'Implements from approved plan'
  },
  ralph: {
    produces: null,
    requires: [],
    description: 'Free agent, no fixed dependencies'
  }
};

/**
 * Computed workflow state for an agent
 */
export interface AgentWorkflowState {
  // Current status
  status: WorkflowStatus;

  // Dependency info
  blockedBy: AgentName | null;
  blockedByFile: WorkflowFile | null;

  // Turn tracking
  isNextUp: boolean;              // Is it this agent's turn?
  waitingOnMe: AgentName[];       // Who is waiting for this agent?
  turnCategory: TurnCategory;     // UI grouping category

  // Phase tracking
  currentPhase: number;           // 0-5 based on completed files (HANDOFF markers)
  totalPhases: number;            // 5 workflow files: context, research, plan, qa-review, progress
  phaseOwner: AgentName | null;   // Who should be working this phase
  phaseName: string;              // Human-readable phase name

  // QA awareness
  awaitingQA: boolean;            // Is this agent's output in QA?
  qaPass: 1 | 2 | null;           // Which QA pass (for Enzo)

  // UI hints
  canStart: boolean;              // All dependencies met
  statusLabel: string;            // Human-readable status
  statusColor: string;            // Tailwind color class
}
