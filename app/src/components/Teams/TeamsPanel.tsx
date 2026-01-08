import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTeamStore } from '../../store/teamStore';
import { useToastStore } from '../../store/toastStore';
import { TeamEditor } from './TeamEditor';
import { Users, Plus, Edit2, Check, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TeamConfig, AgentDirectoryInfo } from '@/types';

export const TeamsPanel: React.FC = () => {
  const { availableTeams, loadAvailableTeams, loadTeam } = useTeamStore();
  const { success, error: showError } = useToastStore();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [agentInfos, setAgentInfos] = useState<AgentDirectoryInfo[]>([]);
  const [contextMenuTeam, setContextMenuTeam] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Fetch agent directories for role/model info
  const fetchAgentInfos = useCallback(async () => {
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      setAgentInfos(dirs);
    } catch (err) {
      console.error('Failed to load agent info:', err);
    }
  }, []);

  // Get agent info by name
  const getAgentInfo = (name: string) => agentInfos.find(a => a.name === name);

  useEffect(() => {
    loadAvailableTeams();
    fetchAgentInfos();
  }, [loadAvailableTeams, fetchAgentInfos]);

  const handleSelectTeam = async (teamName: string) => {
    setSelectedTeam(teamName);
    try {
      await loadTeam(teamName);
      setTeamConfig(useTeamStore.getState().currentTeam);
    } catch (err) {
      showError(`Failed to load team: ${err}`);
    }
  };

  const handleEditTeam = () => {
    if (selectedTeam) {
      setIsEditing(true);
    }
  };

  const handleCreateTeam = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedTeam(null);
    setTeamConfig(null);
  };

  const handleSaveComplete = async (savedTeamName: string) => {
    setIsEditing(false);
    setIsCreating(false);
    await loadAvailableTeams();
    setSelectedTeam(savedTeamName);
    await handleSelectTeam(savedTeamName);
    success(`Team '${savedTeamName}' saved successfully`);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (isCreating) {
      setSelectedTeam(null);
      setTeamConfig(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, teamName: string) => {
    e.preventDefault();

    // Estimate menu height (2 items * ~40px each + padding)
    const menuHeight = 100;
    const viewportHeight = window.innerHeight;

    // If menu would overflow bottom, position it above cursor
    const y = e.clientY + menuHeight > viewportHeight
      ? e.clientY - menuHeight
      : e.clientY;

    setContextMenuTeam(teamName);
    setContextMenuPos({ x: e.clientX, y: Math.max(8, y) });
  };

  const handleDeleteTeam = async (teamName: string) => {
    if (teamName === 'default') {
      showError('Cannot delete the default team');
      setContextMenuTeam(null);
      setContextMenuPos(null);
      return;
    }

    try {
      await invoke('delete_team', { teamName });
      if (selectedTeam === teamName) {
        setSelectedTeam(null);
        setTeamConfig(null);
      }
      await loadAvailableTeams();
      success(`Team '${teamName}' deleted successfully`);
    } catch (err) {
      showError(`Failed to delete team: ${err}`);
    } finally {
      setContextMenuTeam(null);
      setContextMenuPos(null);
    }
  };

  // Close context menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
      setContextMenuTeam(null);
      setContextMenuPos(null);
    }
  }, []);

  useEffect(() => {
    if (!contextMenuPos) return;

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenuPos, handleClickOutside]);

  if (isEditing) {
    return (
      <TeamEditor
        teamConfig={isCreating ? null : teamConfig}
        onSave={handleSaveComplete}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team Configurations</h1>
          <p className="text-sm text-muted-foreground">Manage agent teams and workflows</p>
        </div>
        <Button onClick={handleCreateTeam}>
          <Plus />
          New Team
        </Button>
      </div>

      {/* Team List and Details */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Team List - Fixed Width */}
        <div className="w-[320px] flex flex-col flex-shrink-0 bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2 flex-shrink-0">
            Available Teams ({availableTeams.length})
          </h2>
          <div className="flex-1 overflow-auto px-2 pb-4 space-y-1">
            {availableTeams.map((teamName) => (
              <button
                key={teamName}
                onClick={() => handleSelectTeam(teamName)}
                onContextMenu={(e) => handleContextMenu(e, teamName)}
                className={`w-full text-left p-2.5 rounded-lg transition-colors flex items-center gap-2 ${
                  selectedTeam === teamName
                    ? 'bg-primary/10 border border-primary/30 text-foreground'
                    : 'bg-secondary/30 border border-border hover:bg-secondary/50 text-foreground'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-sm truncate">{teamName}</span>
                {teamName === 'default' && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    Default
                  </Badge>
                )}
                {selectedTeam === teamName && (
                  <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
            {availableTeams.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No teams found. Create your first team.
              </p>
            )}
          </div>

        </div>

        {/* Team Details - Flexible */}
        <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border p-6 overflow-auto">
          {teamConfig ? (
            <div>
              {/* Team Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{teamConfig.team.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {teamConfig.team.agents.length} agents configured
                  </p>
                </div>
                <Button variant="secondary" onClick={handleEditTeam}>
                  <Edit2 />
                  Edit
                </Button>
              </div>

              {/* Agents Grid */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Agents
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teamConfig.team.agents.map((agent) => {
                    const info = getAgentInfo(agent.name);
                    return (
                      <div
                        key={agent.name}
                        className="p-3 rounded-lg bg-secondary/30 border border-border"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-foreground capitalize">{agent.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{info?.role || 'No role'}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Model: {info?.model || 'unknown'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Workflow */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Workflow Phases
                </h3>
                <div className="space-y-2">
                  {teamConfig.team.workflow.phases.map((phase, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/50"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <span className="font-medium text-foreground">{phase.name}</span>
                        <span className="text-muted-foreground mx-2">-</span>
                        <span className="text-sm text-muted-foreground capitalize">{phase.owner}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{phase.output}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coordinator */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Coordinator
                </h3>
                <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="font-medium text-foreground capitalize">
                    {teamConfig.team.workflow.coordinator}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    manages workflow and assignments
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">Select a team to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu - Rendered via portal to bypass CSS containment issues */}
      {contextMenuTeam && contextMenuPos && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
          }}
        >
          <Button
            variant="ghost"
            className="w-full justify-start rounded-none"
            onClick={() => {
              handleSelectTeam(contextMenuTeam);
              setIsEditing(true);
              setContextMenuTeam(null);
              setContextMenuPos(null);
            }}
          >
            <Edit2 />
            Edit Team
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-none text-destructive hover:text-destructive"
            onClick={() => handleDeleteTeam(contextMenuTeam)}
            disabled={contextMenuTeam === 'default'}
          >
            <Trash2 />
            Delete Team
          </Button>
        </div>,
        document.body
      )}
    </div>
  );
};
