import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { MessageCircle, Activity, Bot, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { useTeamStore } from '../../store/teamStore';
import { useDepartmentStore } from '../../store/departmentStore';
import { useAgentStore } from '../../store/agentStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { useTeamMessages } from '../../hooks/useTeamMessages';
import { useFreeAgentMessages } from '../../hooks/useFreeAgentMessages';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { TeamListItem } from './TeamListItem';
import { FreeAgentListItem } from './FreeAgentListItem';
import { TeamChatHeader } from './TeamChatHeader';
import { cn } from '../../lib/utils';
import type { HistoryEntry } from '../../types';
import type { ChatMode } from '../../store/chatViewStore';

export const ChatView: React.FC = () => {
  const {
    chatMode,
    activeTeam,
    activeFreeAgent,
    agentFilter,
    setChatMode,
    setActiveTeam,
    setActiveFreeAgent,
    setAgentFilter
  } = useChatViewStore();
  const { availableTeams, teamConfigs, loadAvailableTeams, loadAllTeams } = useTeamStore();
  const { loadDepartments, collapsedDepartments, toggleDepartmentCollapsed, getGroupedTeams } = useDepartmentStore();
  const { freeAgents } = useAgentStore();

  // Mobile: track whether to show chat panel (vs team list)
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Load teams and departments on mount
  useEffect(() => {
    loadAvailableTeams().then(() => loadAllTeams());
    loadDepartments();
  }, [loadAvailableTeams, loadAllTeams, loadDepartments]);

  // Get teams grouped by department
  const departmentGroups = getGroupedTeams(availableTeams);

  // Get team chat state for selected team
  const teamState = useTeamMessages(activeTeam);

  // Get free agent chat state for selected free agent
  const freeAgentState = useFreeAgentMessages(activeFreeAgent);

  // Auto-select first team when in teams mode
  useEffect(() => {
    if (chatMode === 'teams' && !activeTeam && availableTeams.length > 0) {
      setActiveTeam(availableTeams[0]);
    }
  }, [chatMode, activeTeam, availableTeams, setActiveTeam]);

  // Auto-select first free agent when in agents mode
  useEffect(() => {
    if (chatMode === 'agents' && !activeFreeAgent && freeAgents.length > 0) {
      setActiveFreeAgent(freeAgents[0].session);
    }
  }, [chatMode, activeFreeAgent, freeAgents, setActiveFreeAgent]);

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

  // Handle free agent selection (also opens chat on mobile)
  const handleSelectFreeAgent = useCallback(
    (session: string) => {
      setActiveFreeAgent(session);
      setShowMobileChat(true);
    },
    [setActiveFreeAgent]
  );

  // Handle back button on mobile
  const handleBackToList = useCallback(() => {
    setShowMobileChat(false);
  }, []);

  // Handle tab change
  const handleTabChange = useCallback(
    (mode: ChatMode) => {
      setChatMode(mode);
      setShowMobileChat(false);
    },
    [setChatMode]
  );

  // Compute states for rendering
  const hasTeams = availableTeams.length > 0;
  const hasFreeAgents = freeAgents.length > 0;
  const isAnyTeamAgentActive = teamState?.activeAgentCount
    ? teamState.activeAgentCount > 0
    : false;
  const isFreeAgentActive = freeAgentState?.isActive || false;

  // Render team list sidebar content
  const renderTeamList = () => (
    <div className="flex-1 overflow-y-auto p-2 space-y-3">
      {!hasTeams ? (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
          <Activity className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No teams found</p>
          <p className="text-xs mt-1">Configure teams in Settings</p>
        </div>
      ) : (
        departmentGroups.map((group) => {
          const isCollapsed = collapsedDepartments.includes(group.name);
          return (
            <div key={group.name}>
              {/* Department Header */}
              <button
                onClick={() => toggleDepartmentCollapsed(group.name)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary/30 rounded-lg transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.name}
                </span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto">
                  {group.teams.length}
                </span>
              </button>

              {/* Team List (collapsible) */}
              {!isCollapsed && (
                <div className="mt-1 space-y-1">
                  {group.teams.map((teamName) => (
                    <TeamListItem
                      key={teamName}
                      teamName={teamName}
                      teamConfig={teamConfigs.get(teamName)}
                      isSelected={teamName === activeTeam}
                      onClick={() => handleSelectTeam(teamName)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  // Render free agent list sidebar content
  const renderFreeAgentList = () => (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {!hasFreeAgents ? (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
          <Bot className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No free agents</p>
          <p className="text-xs mt-1">Spawn a Ralph instance to chat</p>
        </div>
      ) : (
        freeAgents.map((agent) => (
          <FreeAgentListItem
            key={agent.session}
            session={agent.session}
            isSelected={agent.session === activeFreeAgent}
            onClick={() => handleSelectFreeAgent(agent.session)}
          />
        ))
      )}
    </div>
  );

  // Render tab switcher
  const renderTabSwitcher = () => (
    <div className="flex items-center gap-1 p-2">
      <div className="flex items-center gap-1 p-1 glass-card rounded-lg flex-1">
        <button
          onClick={() => handleTabChange('teams')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all',
            chatMode === 'teams' && 'bg-foreground/10 text-foreground',
            chatMode !== 'teams' && 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Teams</span>
          {hasTeams && (
            <span className="text-[10px] px-1 rounded bg-foreground/10">{availableTeams.length}</span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('agents')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all',
            chatMode === 'agents' && 'bg-foreground/10 text-foreground',
            chatMode !== 'agents' && 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Free Agents</span>
          {hasFreeAgents && (
            <span className="text-[10px] px-1 rounded bg-foreground/10">{freeAgents.length}</span>
          )}
        </button>
      </div>
    </div>
  );

  // Render chat panel content for teams
  const renderTeamChatPanel = () => {
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
          disabled={!isAnyTeamAgentActive}
          placeholder={
            isAnyTeamAgentActive
              ? `Message ${teamState.teamName} team...`
              : 'No active agents in team'
          }
        />
      </>
    );
  };

  // Render chat panel content for free agents
  const renderFreeAgentChatPanel = () => {
    if (!hasFreeAgents) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No free agents</p>
            <p className="text-sm">Spawn a Ralph instance to chat</p>
          </div>
        </div>
      );
    }

    if (!freeAgentState) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Select an agent</p>
            <p className="text-sm">Choose an agent from the list to start chatting</p>
          </div>
        </div>
      );
    }

    // Build agent info map for free agent messages
    const freeAgentInfoMap = new Map<number, { agentName: string; agentColor: string }>();
    freeAgentState.messages.forEach((msg, index) => {
      freeAgentInfoMap.set(index, {
        agentName: msg.agentName,
        agentColor: msg.agentColor,
      });
    });

    return (
      <>
        {/* Simple header for free agent */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border text-sm font-medium">
          <button
            onClick={handleBackToList}
            className="md:hidden -ml-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="truncate">{freeAgentState.agentName}</span>
          <span className="text-muted-foreground font-normal">
            {isFreeAgentActive ? 'active' : 'idle'}
          </span>
          {freeAgentState.isWorking && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>

        {/* Message list */}
        <ChatMessageList
          entries={freeAgentState.messages}
          isActive={freeAgentState.isWorking}
          agentName={freeAgentState.agentName}
          session={freeAgentState.session}
          agentInfo={freeAgentInfoMap}
        />

        {/* Input bar */}
        <ChatInput
          session={freeAgentState.session}
          disabled={!isFreeAgentActive}
          placeholder={
            isFreeAgentActive
              ? `Message ${freeAgentState.agentName}...`
              : 'Agent is not active'
          }
        />
      </>
    );
  };

  // Render the appropriate chat panel based on mode
  const renderChatPanel = () => {
    if (chatMode === 'teams') {
      return renderTeamChatPanel();
    }
    return renderFreeAgentChatPanel();
  };

  return (
    <div className="h-full flex">
      {/* Left sidebar - Team/Agent list with tabs */}
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
        {/* Tab switcher */}
        {renderTabSwitcher()}

        {/* Render list based on mode */}
        {chatMode === 'teams' ? renderTeamList() : renderFreeAgentList()}
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
