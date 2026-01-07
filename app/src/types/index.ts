// Agent and session types matching Rust backend structures

export interface AgentStatus {
  name: string;
  team: string;  // Team this agent belongs to (empty for ralph)
  active: boolean;
  session: string;
  attached: boolean;
  context_usage?: number;  // Context window usage percentage (0-100)
  current_project?: string;  // Current project from statusline (undefined if VIBING)
  created_at?: number;  // Unix timestamp in milliseconds (for spawned agents)
}

export interface AgentStatusList {
  team: AgentStatus[];   // Agents belonging to teams (defined in team YAML config)
  free: AgentStatus[];   // Free agents not bound to any team (e.g., ralph)
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

// Note: role and model are no longer in team config - they come from agent.json
export interface AgentConfig {
  name: string;
  output_file: string | null;
  required_sections: string[];
  file_permissions: 'restricted' | 'permissive' | 'no_projects';
  workflow_participant: boolean;
  awaits_qa?: boolean;
  qa_passes?: number;
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

// Dynamic agent metadata (populated from agent.json files at runtime)
// Role comes from agent.json, not team config
export let AGENT_DESCRIPTIONS: Record<string, string> = {};

// Update descriptions from agent directory info (called after fetching agent metadata)
export function updateAgentDescriptions(agentInfos: AgentDirectoryInfo[]) {
  AGENT_DESCRIPTIONS = {};
  for (const agent of agentInfos) {
    if (agent.role) {
      AGENT_DESCRIPTIONS[agent.name] = agent.role;
    }
  }
}

// Legacy function for backwards compatibility - no longer uses team config
export function updateAgentDescriptionsFromTeam(_team: TeamConfig) {
  // No-op: role is no longer in team config
  // Descriptions are now populated from agent.json via updateAgentDescriptions
}

// Agent directory management types
export interface AgentDirectoryInfo {
  name: string;
  exists: boolean;
  has_claude_md: boolean;
  has_agent_json: boolean;
  path: string;
  role: string | null;
  model: string | null;
}

// Agent metadata stored in agent.json
export interface AgentMetadata {
  role: string;
  model: string;
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
 * Note: description now comes from AGENT_DESCRIPTIONS (agent.json) or falls back to phase name
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
    // Use AGENT_DESCRIPTIONS from agent.json or fall back to agent name
    return {
      produces: null,
      requires: [],
      description: AGENT_DESCRIPTIONS[agentName] || agentName,
    };
  }

  // Map output to WorkflowFile
  const produces = phase.output.replace(/\.md$/, '') as WorkflowFile;

  // Map requires to WorkflowFile[]
  const requires = phase.requires.map(r => r.replace(/\.md$/, '') as WorkflowFile);

  return {
    produces,
    requires,
    description: AGENT_DESCRIPTIONS[agentName] || phase.name,
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
 * Workflow step for progress tracking UI
 * Derived from team config phases
 */
export interface WorkflowStep {
  key: string;           // File basename without .md (e.g., 'research')
  label?: string;        // Optional display label (phase name)
  owner?: string;        // Agent that produces this file
}

/**
 * Get workflow steps for progress tracking from team config
 * Returns ordered list of files to track: context → phase outputs → NOTES
 */
export function getWorkflowSteps(team: TeamConfig | null): WorkflowStep[] {
  if (!team) {
    // Fallback for when team config isn't loaded yet
    return [
      { key: 'context' },
      { key: 'research' },
      { key: 'plan' },
      { key: 'plan-review' },
      { key: 'progress' },
      { key: 'NOTES' },
    ];
  }

  const steps: WorkflowStep[] = [];

  // Always start with context (prerequisite for first phase)
  steps.push({ key: 'context', label: 'Context' });

  // Add each phase's output file
  for (const phase of team.team.workflow.phases) {
    const fileKey = phase.output.replace(/\.md$/, '');
    steps.push({
      key: fileKey,
      label: phase.name,
      owner: phase.owner,
    });
  }

  // Add coordinator's NOTES file at the end
  const coordinatorAgent = team.team.agents.find(
    a => a.name === team.team.workflow.coordinator
  );
  if (coordinatorAgent?.output_file) {
    const notesKey = coordinatorAgent.output_file.replace(/\.md$/, '');
    // Only add if not already included from phases
    if (!steps.some(s => s.key === notesKey)) {
      steps.push({
        key: notesKey,
        label: 'Notes',
        owner: team.team.workflow.coordinator,
      });
    }
  }

  return steps;
}

/**
 * Get file order mapping for sorting project files
 * Derived from workflow steps
 */
export function getFileOrder(team: TeamConfig | null): Record<string, number> {
  const steps = getWorkflowSteps(team);
  const order: Record<string, number> = {};
  steps.forEach((step, index) => {
    order[step.key] = index;
  });
  return order;
}

/**
 * Check if a session belongs to a team agent
 * Session formats:
 * - Team-scoped: agent-{team}-{name} or agent-{team}-{name}-{instance}
 * - Legacy: agent-{name} (treated as team "default")
 */
export function isTeamAgent(sessionName: string, team: TeamConfig | null): boolean {
  if (!team) return false;

  // Ralph sessions are free agents, not team agents
  if (sessionName.match(/^agent-ralph-[a-z0-9]+$/)) {
    return false;
  }

  // Try team-scoped format: agent-{team}-{name}[-{instance}]
  const teamMatch = sessionName.match(/^agent-([a-z0-9]+)-([a-z]+)(?:-[a-z0-9]+)?$/);
  if (teamMatch) {
    const sessionTeam = teamMatch[1];
    const agentName = teamMatch[2];

    // Only match if the team matches and agent is in team config
    if (sessionTeam !== team.team.name) return false;
    return team.team.agents.some(a => a.name === agentName);
  }

  // Try legacy format: agent-{name}
  const legacyMatch = sessionName.match(/^agent-([a-z]+)$/);
  if (legacyMatch) {
    const agentName = legacyMatch[1];
    return team.team.agents.some(a => a.name === agentName);
  }

  return false;
}

/**
 * Get all team members from team config (all agents defined in team)
 */
export function getTeamMembers(team: TeamConfig | null): string[] {
  if (!team) return [];
  return team.team.agents.map(a => a.name);
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
