import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTeamStore } from '../../store/teamStore';
import { useToastStore } from '../../store/toastStore';
import { TeamEditor } from './TeamEditor';
import { Users, Plus, Edit2, Check, FileText } from 'lucide-react';
import type { TeamConfig, AgentDirectoryInfo } from '@/types';

export const TeamsPanel: React.FC = () => {
  const { availableTeams, loadAvailableTeams, loadTeam } = useTeamStore();
  const { success, error: showError } = useToastStore();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [agentInfos, setAgentInfos] = useState<AgentDirectoryInfo[]>([]);

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Team Configurations</h1>
            <p className="text-sm text-muted-foreground">Manage agent teams and workflows</p>
          </div>
        </div>
        <button
          onClick={handleCreateTeam}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      {/* Team List and Details */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Team List */}
        <div className="lg:col-span-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border p-4 overflow-auto">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Available Teams ({availableTeams.length})
          </h2>
          <div className="space-y-2">
            {availableTeams.map((teamName) => (
              <button
                key={teamName}
                onClick={() => handleSelectTeam(teamName)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                  selectedTeam === teamName
                    ? 'bg-primary/10 border border-primary/30 text-foreground'
                    : 'bg-secondary/30 border border-border hover:bg-secondary/50 text-foreground'
                }`}
              >
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{teamName}</span>
                {teamName === 'default' && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">
                    Default
                  </span>
                )}
                {selectedTeam === teamName && (
                  <Check className="w-4 h-4 text-primary ml-auto" />
                )}
              </button>
            ))}
            {availableTeams.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No teams found. Create your first team.
              </p>
            )}
          </div>
        </div>

        {/* Team Details */}
        <div className="lg:col-span-2 bg-card/50 backdrop-blur-sm rounded-xl border border-border p-6 overflow-auto">
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
                <button
                  onClick={handleEditTeam}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
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
    </div>
  );
};
