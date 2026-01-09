import { useMemo } from 'react';
import { useLiveOutputStore } from '../store/liveOutputStore';
import { useAgentStore } from '../store/agentStore';
import type { HistoryEntry, AgentStatus } from '../types';
import { getAgentDisplayNameForUI, parseRalphSession } from '../lib/agentIdentity';

const AGENT_COLOR = 'bg-pink-500';

export interface FreeAgentMessage extends HistoryEntry {
  agentName: string;
  agentSession: string;
  agentColor: string;
  isAgentActive: boolean;
}

export interface FreeAgentChatState {
  agentName: string;
  session: string;
  messages: FreeAgentMessage[];
  isActive: boolean;
  isWorking: boolean;
  lastActivity: number;
}

function getAgentDisplayName(agent: AgentStatus): string {
  const ralphName = agent.name === 'ralph' ? parseRalphSession(agent.session) : undefined;
  return getAgentDisplayNameForUI(agent.name, ralphName);
}

export function useFreeAgentMessages(session: string | null): FreeAgentChatState | null {
  const agentOutputs = useLiveOutputStore((state) => state.agentOutputs);
  const { freeAgents } = useAgentStore();

  return useMemo(() => {
    if (!session) return null;

    // Find the free agent by session
    const agent = freeAgents.find((a) => a.session === session);
    if (!agent) return null;

    const output = agentOutputs[session];
    const messages: FreeAgentMessage[] = [];
    const isWorking = output?.isActive || false;

    if (output) {
      for (const entry of output.entries) {
        messages.push({
          ...entry,
          agentName: getAgentDisplayName(agent),
          agentSession: session,
          agentColor: AGENT_COLOR,
          isAgentActive: output.isActive,
        });
      }
    }

    // Sort chronologically by timestamp
    messages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Get last activity timestamp
    const lastActivity =
      messages.length > 0
        ? new Date(messages[messages.length - 1].timestamp).getTime()
        : 0;

    return {
      agentName: getAgentDisplayName(agent),
      session,
      messages,
      isActive: agent.active,
      isWorking,
      lastActivity,
    };
  }, [session, agentOutputs, freeAgents]);
}
