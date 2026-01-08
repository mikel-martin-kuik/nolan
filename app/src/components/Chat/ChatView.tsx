import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { MessageCircle, Activity } from 'lucide-react';
import { useTeamStore } from '../../store/teamStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { useTeamMessages } from '../../hooks/useTeamMessages';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { TeamListItem } from './TeamListItem';
import { TeamChatHeader } from './TeamChatHeader';
import { cn } from '../../lib/utils';
import type { HistoryEntry } from '../../types';

export const ChatView: React.FC = () => {
  const { activeTeam, agentFilter, setActiveTeam, setAgentFilter } = useChatViewStore();
  const { availableTeams, teamConfigs, loadAvailableTeams, loadAllTeams } = useTeamStore();

  // Mobile: track whether to show chat panel (vs team list)
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Load teams on mount
  useEffect(() => {
    loadAvailableTeams().then(() => loadAllTeams());
  }, [loadAvailableTeams, loadAllTeams]);

  // Get team chat state for selected team
  const teamState = useTeamMessages(activeTeam);

  // Auto-select first team
  useEffect(() => {
    if (!activeTeam && availableTeams.length > 0) {
      setActiveTeam(availableTeams[0]);
    }
  }, [activeTeam, availableTeams, setActiveTeam]);

  // Filter messages by agent if filter is set
  const filteredMessages = useMemo(() => {
    if (!teamState) return [];
    if (!agentFilter) return teamState.messages;
    return teamState.messages.filter((m) => m.agentSession === agentFilter);
  }, [teamState, agentFilter]);

  // Convert TeamMessage[] to HistoryEntry[] for ChatMessageList
  const entries: HistoryEntry[] = filteredMessages;

  // Create agent info map for team chat attribution
  const agentInfoMap = useMemo(() => {
    const map = new Map<number, { agentName: string; agentColor: string }>();
    filteredMessages.forEach((msg, index) => {
      map.set(index, {
        agentName: msg.agentName,
        agentColor: msg.agentColor,
      });
    });
    return map;
  }, [filteredMessages]);

  // Handle team selection (also opens chat on mobile)
  const handleSelectTeam = useCallback(
    (team: string) => {
      setActiveTeam(team);
      setShowMobileChat(true);
    },
    [setActiveTeam]
  );

  // Handle back button on mobile
  const handleBackToList = useCallback(() => {
    setShowMobileChat(false);
  }, []);

  // Compute states for rendering
  const hasTeams = availableTeams.length > 0;
  const isAnyAgentActive = teamState?.activeAgentCount
    ? teamState.activeAgentCount > 0
    : false;

  // Render team list sidebar content
  const renderTeamList = () => (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {!hasTeams ? (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
          <Activity className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No teams found</p>
          <p className="text-xs mt-1">Configure teams in Settings</p>
        </div>
      ) : (
        availableTeams.map((teamName) => (
          <TeamListItem
            key={teamName}
            teamName={teamName}
            teamConfig={teamConfigs.get(teamName)}
            teamState={useTeamMessages(teamName)}
            isSelected={teamName === activeTeam}
            onClick={() => handleSelectTeam(teamName)}
          />
        ))
      )}
    </div>
  );

  // Render chat panel content
  const renderChatPanel = () => {
    if (!hasTeams) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No teams available</p>
            <p className="text-sm">Configure teams to start chatting</p>
          </div>
        </div>
      );
    }

    if (!teamState) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Select a team</p>
            <p className="text-sm">Choose a team from the list to start chatting</p>
          </div>
        </div>
      );
    }

    // Get coordinator session for sending messages
    const coordinatorSession = teamState.coordinator
      ? `agent-${activeTeam}-${teamState.coordinator}`
      : null;

    return (
      <>
        {/* Chat header */}
        <TeamChatHeader
          teamState={teamState}
          agentFilter={agentFilter}
          onAgentFilterChange={setAgentFilter}
          onBackClick={handleBackToList}
        />

        {/* Message list */}
        <ChatMessageList
          entries={entries}
          isActive={teamState.isAnyAgentWorking}
          agentName={teamState.teamName}
          session={coordinatorSession ?? undefined}
          agentInfo={agentInfoMap}
        />

        {/* Input bar */}
        <ChatInput
          session={coordinatorSession ?? ''}
          disabled={!isAnyAgentActive}
          placeholder={
            isAnyAgentActive
              ? `Message ${teamState.teamName} team...`
              : 'No active agents in team'
          }
        />
      </>
    );
  };

  return (
    <div className="h-full flex">
      {/* Left sidebar - Team list */}
      {/* On mobile: full width when chat not shown, hidden when chat shown */}
      {/* On desktop (md+): always visible with fixed width */}
      <div
        className={cn(
          'flex-col bg-card/30 border-r border-border',
          // Mobile: full width or hidden based on showMobileChat
          showMobileChat ? 'hidden' : 'flex w-full',
          // Desktop: always visible with fixed width
          'md:flex md:w-80 md:flex-shrink-0'
        )}
      >
        {renderTeamList()}
      </div>

      {/* Right panel - Chat */}
      {/* On mobile: full width when shown, hidden when list shown */}
      {/* On desktop (md+): always visible, takes remaining space */}
      <div
        className={cn(
          'flex-1 flex-col min-w-0',
          // Mobile: full width or hidden based on showMobileChat
          showMobileChat ? 'flex' : 'hidden',
          // Desktop: always visible
          'md:flex'
        )}
      >
        {renderChatPanel()}
      </div>
    </div>
  );
};
