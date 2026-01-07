/**
 * Hook for computing agent workflow status
 *
 * Combines agent status, project files, and live output to determine
 * each agent's position in the workflow dependency tree.
 *
 * Key concepts:
 * - WorkflowGroup: Groups by status (attention, active, blocked, idle)
 * - TurnGroup: Groups by turn (action_needed, in_progress, waiting, finished, inactive)
 * - isNextUp: True if this agent should be working NOW
 * - waitingOnMe: Agents blocked by this agent's incomplete work
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAgentStore } from '../store/agentStore';
import { useLiveOutputStore } from '../store/liveOutputStore';
import { useTeamStore } from '../store/teamStore';
import {
  computeWorkflowState,
  getWorkflowGroup,
  getTurnGroup,
  sortByWorkflowPriority,
  type WorkflowGroup,
  type TurnGroup,
} from '../lib/workflowStatus';
import type { AgentStatus, AgentWorkflowState, AgentName } from '../types';
import type { ProjectInfo, FileCompletion } from '../types/projects';

export interface AgentWithWorkflow {
  agent: AgentStatus;
  state: AgentWorkflowState;
  group: WorkflowGroup;
  turnGroup: TurnGroup;
  hasMessages: boolean;
  isStreaming: boolean;
}

export interface WorkflowStatusResult {
  // All agents with computed workflow state
  agents: AgentWithWorkflow[];

  // Grouped by status (attention, active, blocked, idle)
  grouped: Record<WorkflowGroup, AgentWithWorkflow[]>;

  // Grouped by turn (action_needed, in_progress, waiting, finished, inactive)
  turnGrouped: Record<TurnGroup, AgentWithWorkflow[]>;

  // The agent who should be working NOW (phase owner)
  nextUp: AgentWithWorkflow | null;

  // Current workflow phase info
  currentPhase: number;
  phaseName: string;
  phaseOwner: AgentName | null;

  // Project context
  projectFiles: FileCompletion[];
  currentProject: string | null;
  isLoading: boolean;
}

/**
 * Hook to get workflow status for all agents
 */
export function useWorkflowStatus(): WorkflowStatusResult {
  const { teamAgents, freeAgents } = useAgentStore();
  const { agentOutputs } = useLiveOutputStore();
  const { currentTeam } = useTeamStore();

  // Find the current active project (from any active agent)
  const currentProject = useMemo(() => {
    const allAgents = [...teamAgents, ...freeAgents];
    const activeWithProject = allAgents.find(
      a => a.active && a.current_project && a.current_project !== 'VIBING'
    );
    return activeWithProject?.current_project || null;
  }, [teamAgents, freeAgents]);

  // Fetch project files if we have an active project
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => invoke<ProjectInfo[]>('list_projects'),
    refetchInterval: 10000, // Refresh every 10s for workflow updates
  });

  // Get the current project's file completions (with HANDOFF marker status)
  const projectFiles = useMemo(() => {
    if (!currentProject || !projects) return [];
    const project = projects.find(p => p.name === currentProject);
    // Prefer file_completions for accurate completion tracking
    return project?.file_completions || [];
  }, [currentProject, projects]);

  // Compute workflow state for each agent
  const agents = useMemo(() => {
    const allAgents = [...teamAgents, ...freeAgents];

    const computed = allAgents.map((agent): AgentWithWorkflow => {
      const output = agentOutputs[agent.session];
      const hasMessages = (output?.entries?.length || 0) > 0;
      const isStreaming = output?.isActive || false;

      // Use the agent's own project or the team project
      const agentProject = agent.current_project && agent.current_project !== 'VIBING'
        ? agent.current_project
        : currentProject;

      // Get file completions for this agent's project
      let files = projectFiles;
      if (agentProject && agentProject !== currentProject && projects) {
        const proj = projects.find(p => p.name === agentProject);
        files = proj?.file_completions || [];
      }

      // Skip if no team config loaded yet
      if (!currentTeam) {
        return {
          agent,
          state: {
            status: 'offline',
            blockedBy: null,
            blockedByFile: null,
            isNextUp: false,
            waitingOnMe: [],
            turnCategory: 'not_involved',
            currentPhase: 0,
            totalPhases: 5,
            phaseOwner: null,
            phaseName: 'CONTEXT',
            awaitingQA: false,
            qaPass: null,
            canStart: false,
            statusLabel: 'Offline',
            statusColor: 'bg-muted-foreground/40',
          },
          group: 'idle',
          turnGroup: 'inactive',
          hasMessages,
          isStreaming,
        } as AgentWithWorkflow;
      }

      const state = computeWorkflowState(agent, files, isStreaming, hasMessages, currentTeam);
      const group = getWorkflowGroup(state.status);
      const turnGroup = getTurnGroup(state.turnCategory, state.status);

      return {
        agent,
        state,
        group,
        turnGroup,
        hasMessages,
        isStreaming,
      };
    });

    // === POST-PROCESSING: Validate blockedBy based on actual agent activity ===
    // Rule: You can only be "blocked by X" if X is active AND streaming (actually working)

    // Get workflow participants from team config (if loaded)
    const workflowParticipants = currentTeam
      ? currentTeam.team.agents.filter(a => a.workflow_participant).map(a => a.name)
      : [];
    const coordinator = currentTeam?.team.workflow.coordinator || 'dan';

    // Helper: Check if an agent is actively working (streaming)
    const isActivelyWorking = (name: string) => {
      const agent = computed.find(a => a.agent.name === name);
      return agent && agent.agent.active && agent.isStreaming;
    };

    for (const agentData of computed) {
      // Clear blockedBy if the blocker isn't actively working
      if (agentData.state.blockedBy && !isActivelyWorking(agentData.state.blockedBy)) {
        agentData.state = {
          ...agentData.state,
          blockedBy: null,
        };
      }
    }

    // Special handling for coordinator: blocked by any actively working team member
    const coordinatorAgent = computed.find(a => a.agent.name === coordinator);
    if (coordinatorAgent && coordinatorAgent.agent.active && coordinatorAgent.state.status === 'waiting_input') {
      const workingTeamMember = computed.find(
        a => workflowParticipants.includes(a.agent.name) && a.agent.active && a.isStreaming
      );

      if (workingTeamMember) {
        coordinatorAgent.state = {
          ...coordinatorAgent.state,
          status: 'blocked',
          statusLabel: 'Blocked',
          statusColor: 'bg-red-500',
          blockedBy: workingTeamMember.agent.name as AgentName,
        };
        coordinatorAgent.group = getWorkflowGroup('blocked');
        coordinatorAgent.turnGroup = getTurnGroup(coordinatorAgent.state.turnCategory, 'blocked');
      }
    }

    // Sort by workflow priority
    return computed.sort(sortByWorkflowPriority);
  }, [teamAgents, freeAgents, agentOutputs, projectFiles, currentProject, projects, currentTeam]);

  // Group agents by workflow status
  const grouped = useMemo(() => {
    const groups: Record<WorkflowGroup, AgentWithWorkflow[]> = {
      attention: [],
      active: [],
      blocked: [],
      idle: [],
    };

    agents.forEach(agent => {
      groups[agent.group].push(agent);
    });

    return groups;
  }, [agents]);

  // Group agents by turn category
  const turnGrouped = useMemo(() => {
    const groups: Record<TurnGroup, AgentWithWorkflow[]> = {
      action_needed: [],
      in_progress: [],
      waiting: [],
      finished: [],
      inactive: [],
    };

    agents.forEach(agent => {
      groups[agent.turnGroup].push(agent);
    });

    return groups;
  }, [agents]);

  // Find the agent who should be working NOW
  const nextUp = useMemo(() => {
    return agents.find(a => a.state.isNextUp) || null;
  }, [agents]);

  // Extract phase info from the first agent with valid phase data
  const phaseInfo = useMemo(() => {
    const firstWithPhase = agents.find(a => a.state.currentPhase >= 0);
    return {
      currentPhase: firstWithPhase?.state.currentPhase ?? 0,
      phaseName: firstWithPhase?.state.phaseName ?? 'CONTEXT',
      phaseOwner: firstWithPhase?.state.phaseOwner ?? null,
    };
  }, [agents]);

  return {
    agents,
    grouped,
    turnGrouped,
    nextUp,
    currentPhase: phaseInfo.currentPhase,
    phaseName: phaseInfo.phaseName,
    phaseOwner: phaseInfo.phaseOwner,
    projectFiles,
    currentProject,
    isLoading,
  };
}
