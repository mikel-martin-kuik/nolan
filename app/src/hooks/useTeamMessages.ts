import { useMemo } from 'react';
import { useLiveOutputStore } from '../store/liveOutputStore';
import { useAgentStore } from '../store/agentStore';
import { useTeamStore } from '../store/teamStore';
import type { HistoryEntry, AgentStatus } from '../types';
import { getAgentDisplayNameForUI, parseRalphSession } from '../lib/agentIdentity';

// Agent colors for visual distinction in team chat
const AGENT_COLORS: Record<string, string> = {
  ana: 'bg-blue-500',
  bill: 'bg-green-500',
  carl: 'bg-orange-500',
  dan: 'bg-purple-500',
  enzo: 'bg-teal-500',
  frank: 'bg-red-500',
  ralph: 'bg-pink-500',
};

export interface TeamMessage extends HistoryEntry {
  agentName: string;
  agentSession: string;
  agentColor: string;
  isAgentActive: boolean;
}

export interface TeamChatState {
  teamName: string;
  messages: TeamMessage[];
  activeAgentCount: number;
  totalAgentCount: number;
  lastActivity: number;
  isAnyAgentWorking: boolean;
  noteTaker: string | null;
}

function getAgentDisplayName(agent: AgentStatus): string {
  const ralphName = agent.name === 'ralph' ? parseRalphSession(agent.session) : undefined;
  return getAgentDisplayNameForUI(agent.name, ralphName);
}

function getAgentColor(agentName: string): string {
  return AGENT_COLORS[agentName.toLowerCase()] || 'bg-zinc-500';
}

export function useTeamMessages(teamName: string | null): TeamChatState | null {
  const agentOutputs = useLiveOutputStore((state) => state.agentOutputs);
  const { teamAgents } = useAgentStore();
  const { teamConfigs } = useTeamStore();

  return useMemo(() => {
    if (!teamName) return null;

    const teamConfig = teamConfigs.get(teamName);

    // Get all agents for this team
    const teamAgentsList = teamAgents.filter((a) => a.team === teamName);

    if (teamAgentsList.length === 0) return null;

    // Collect all messages from team agents
    const allMessages: TeamMessage[] = [];
    let isAnyWorking = false;

    for (const agent of teamAgentsList) {
      const output = agentOutputs[agent.session];
      if (output) {
        if (output.isActive) {
          isAnyWorking = true;
        }

        for (const entry of output.entries) {
          allMessages.push({
            ...entry,
            agentName: getAgentDisplayName(agent),
            agentSession: agent.session,
            agentColor: getAgentColor(agent.name),
            isAgentActive: output.isActive,
          });
        }
      }
    }

    // Sort chronologically by timestamp
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Count active agents
    const activeCount = teamAgentsList.filter((a) => a.active).length;

    // Get last activity timestamp
    const lastActivity =
      allMessages.length > 0
        ? new Date(allMessages[allMessages.length - 1].timestamp).getTime()
        : 0;

    return {
      teamName,
      messages: allMessages,
      activeAgentCount: activeCount,
      totalAgentCount: teamAgentsList.length,
      lastActivity,
      isAnyAgentWorking: isAnyWorking,
      noteTaker: teamConfig?.team.workflow.note_taker ?? null,
    };
  }, [teamName, agentOutputs, teamAgents, teamConfigs]);
}
