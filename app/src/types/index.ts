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
export const WORKFLOW_FILES = ['context', 'research', 'plan', 'plan-review', 'progress', 'implementation-audit'] as const;
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
 * Derive workflow phases from team config
 * Returns array of phases with proper owner, file, and nextAgent
 */
export function getWorkflowPhases(team: TeamConfig | null): WorkflowPhase[] {
  if (!team) return [];

  return team.team.workflow.phases.map((phase, index) => {
    const nextPhase = team.team.workflow.phases[index + 1];
    // Map output file to WorkflowFile type (strip .md extension if present)
    const fileBase = phase.output.replace(/\.md$/, '') as WorkflowFile;

    return {
      phase: index,
      name: phase.name.toUpperCase().replace(/[- ]/g, '_'),
      owner: phase.owner,
      file: fileBase,
      nextAgent: nextPhase?.owner ?? null,
    };
  });
}

/**
 * Derive agent dependencies from team config workflow phases
 */
export function getAgentDependencies(team: TeamConfig | null): Record<AgentName, {
  upstream: AgentName[];
  downstream: AgentName[];
}> {
  if (!team) return {};

  const deps: Record<AgentName, { upstream: AgentName[]; downstream: AgentName[] }> = {};

  // Initialize all agents with empty dependencies
  for (const agent of team.team.agents) {
    deps[agent.name] = { upstream: [], downstream: [] };
  }

  // Build dependencies from workflow phases
  const phases = team.team.workflow.phases;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const owner = phase.owner;

    // upstream: find phases this phase requires
    for (const req of phase.requires) {
      const requiredPhase = phases.find(p => p.output === req || p.output === `${req}.md`);
      if (requiredPhase && requiredPhase.owner !== owner) {
        if (!deps[owner].upstream.includes(requiredPhase.owner)) {
          deps[owner].upstream.push(requiredPhase.owner);
        }
      }
    }

    // downstream: next phase owner
    const nextPhase = phases[i + 1];
    if (nextPhase && nextPhase.owner !== owner) {
      if (!deps[owner].downstream.includes(nextPhase.owner)) {
        deps[owner].downstream.push(nextPhase.owner);
      }
    }
  }

  return deps;
}

/**
 * Get agent workflow role from team config
 */
export function getAgentWorkflowRole(team: TeamConfig | null, agentName: string): {
  produces: WorkflowFile | null;
  requires: WorkflowFile[];
  description: string;
} {
  if (!team) {
    return { produces: null, requires: [], description: '' };
  }

  const agent = team.team.agents.find(a => a.name === agentName);
  if (!agent) {
    return { produces: null, requires: [], description: '' };
  }

  // Find the phase owned by this agent
  const phase = team.team.workflow.phases.find(p => p.owner === agentName);

  if (!phase) {
    // Agent not in workflow (e.g., ralph)
    return {
      produces: null,
      requires: [],
      description: agent.role,
    };
  }

  // Map output to WorkflowFile
  const produces = phase.output.replace(/\.md$/, '') as WorkflowFile;

  // Map requires to WorkflowFile[]
  const requires = phase.requires.map(r => r.replace(/\.md$/, '') as WorkflowFile);

  return {
    produces,
    requires,
    description: agent.role,
  };
}

/**
 * Get file-to-agent mapping from team config
 */
export function getFileToAgent(team: TeamConfig | null): Record<string, string> {
  if (!team) return {};

  const mapping: Record<string, string> = {};
  for (const phase of team.team.workflow.phases) {
    // Use file basename without .md extension
    const fileKey = phase.output.replace(/\.md$/, '');
    mapping[fileKey] = phase.owner;
  }
  return mapping;
}

/**
 * Check if a session is a core agent from team config
 */
export function isCoreAgent(sessionName: string, team: TeamConfig | null): boolean {
  if (!team) return false;

  // Extract agent name from session: agent-{name} or agent-{name}-{id}
  const match = sessionName.match(/^agent-([a-z]+)(?:-[a-z0-9]+)?$/);
  if (!match) return false;

  const agentName = match[1];
  const coreMembers = [
    team.team.workflow.coordinator,
    ...team.team.agents.filter(a => a.workflow_participant).map(a => a.name)
  ];

  return coreMembers.includes(agentName);
}

/**
 * Get core team members from team config (coordinator + workflow participants)
 */
export function getCoreTeamMembers(team: TeamConfig | null): string[] {
  if (!team) return [];

  const members = new Set<string>();
  members.add(team.team.workflow.coordinator);

  for (const agent of team.team.agents) {
    if (agent.workflow_participant) {
      members.add(agent.name);
    }
  }

  return Array.from(members);
}

// Legacy constants for backward compatibility (will be removed)
// These are now derived from team config at runtime
// TODO: Remove these after all usage sites are updated

/**
 * @deprecated Use getWorkflowPhases(team) instead
 */
export const WORKFLOW_PHASES: WorkflowPhase[] = [];

/**
 * @deprecated Use getAgentDependencies(team) instead
 */
export const AGENT_DEPENDENCIES: Record<AgentName, {
  upstream: AgentName[];
  downstream: AgentName[];
}> = {};

/**
 * @deprecated Use getAgentWorkflowRole(team, agentName) instead
 */
export const AGENT_WORKFLOW_ROLE: Record<AgentName, {
  produces: WorkflowFile | null;
  requires: WorkflowFile[];
  description: string;
}> = {};

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
