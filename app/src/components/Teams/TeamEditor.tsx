import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToastStore } from '../../store/toastStore';
import { Save, X, Plus, Trash2, GripVertical } from 'lucide-react';
import type { TeamConfig, AgentConfig, PhaseConfig } from '@/types';

interface TeamEditorProps {
  teamConfig: TeamConfig | null;
  onSave: (teamName: string) => void;
  onCancel: () => void;
}

const DEFAULT_AGENT: AgentConfig = {
  name: '',
  role: '',
  model: 'sonnet',
  color: '#6b7280',
  output_file: null,
  required_sections: [],
  file_permissions: 'restricted',
  workflow_participant: true,
};

const DEFAULT_PHASE: PhaseConfig = {
  name: '',
  owner: '',
  output: '',
  requires: [],
  template: '',
};

export const TeamEditor: React.FC<TeamEditorProps> = ({
  teamConfig,
  onSave,
  onCancel,
}) => {
  const { error: showError } = useToastStore();
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [coordinator, setCoordinator] = useState('');
  const [phases, setPhases] = useState<PhaseConfig[]>([]);

  // Initialize form from existing config
  useEffect(() => {
    if (teamConfig) {
      setName(teamConfig.team.name);
      setDescription((teamConfig.team as unknown as { description?: string }).description || '');
      setAgents([...teamConfig.team.agents]);
      setCoordinator(teamConfig.team.workflow.coordinator);
      setPhases([...teamConfig.team.workflow.phases]);
    } else {
      // Default for new team
      setName('');
      setDescription('');
      setAgents([{ ...DEFAULT_AGENT }]);
      setCoordinator('');
      setPhases([{ ...DEFAULT_PHASE }]);
    }
  }, [teamConfig]);

  const handleAddAgent = () => {
    const colors = ['#a855f7', '#3b82f6', '#6366f1', '#ec4899', '#10b981', '#f59e0b'];
    setAgents([
      ...agents,
      {
        ...DEFAULT_AGENT,
        color: colors[agents.length % colors.length],
      },
    ]);
  };

  const handleRemoveAgent = (index: number) => {
    setAgents(agents.filter((_, i) => i !== index));
  };

  const handleAgentChange = (index: number, field: keyof AgentConfig, value: unknown) => {
    const newAgents = [...agents];
    newAgents[index] = { ...newAgents[index], [field]: value };
    setAgents(newAgents);
  };

  const handleAddPhase = () => {
    setPhases([...phases, { ...DEFAULT_PHASE }]);
  };

  const handleRemovePhase = (index: number) => {
    setPhases(phases.filter((_, i) => i !== index));
  };

  const handlePhaseChange = (index: number, field: keyof PhaseConfig, value: unknown) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
  };

  const validateConfig = (): string | null => {
    if (!name.trim()) return 'Team name is required';
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return 'Team name must start with lowercase letter, contain only lowercase letters, numbers, and hyphens';
    }
    if (agents.length === 0) return 'At least one agent is required';

    for (const agent of agents) {
      if (!agent.name.trim()) return 'All agents must have a name';
      if (!/^[a-z][a-z0-9-]*$/.test(agent.name)) {
        return `Agent name '${agent.name}' is invalid. Must start with lowercase letter.`;
      }
      if (!agent.role.trim()) return `Agent '${agent.name}' must have a role`;
    }

    const agentNames = agents.map((a) => a.name);
    const uniqueNames = new Set(agentNames);
    if (uniqueNames.size !== agentNames.length) {
      return 'Agent names must be unique';
    }

    if (!coordinator) return 'Coordinator must be selected';
    if (!agentNames.includes(coordinator)) {
      return 'Coordinator must be one of the agents';
    }

    for (const phase of phases) {
      if (!phase.name.trim()) return 'All phases must have a name';
      if (!phase.owner) return `Phase '${phase.name}' must have an owner`;
      if (!agentNames.includes(phase.owner)) {
        return `Phase '${phase.name}' owner '${phase.owner}' is not a valid agent`;
      }
      if (!phase.output.trim()) return `Phase '${phase.name}' must have an output file`;
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateConfig();
    if (validationError) {
      showError(validationError);
      return;
    }

    setSaving(true);
    try {
      const config: TeamConfig = {
        team: {
          name,
          description: description || undefined,
          version: '1.0.0',
          agents,
          workflow: {
            coordinator,
            phases,
          },
          communication: {
            broadcast_groups: [
              {
                name: 'core',
                pattern: '^agent-[a-z]+$',
                members: agents.filter((a) => a.workflow_participant).map((a) => a.name),
              },
              {
                name: 'all_agents',
                pattern: '^agent-[a-z]+(-[0-9]+)?$',
                members: agents.map((a) => a.name),
              },
            ],
          },
        },
      };

      await invoke('save_team_config', { teamName: name, config });
      onSave(name);
    } catch (err) {
      showError(`Failed to save team: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          {teamConfig ? `Edit Team: ${teamConfig.team.name}` : 'Create New Team'}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto space-y-6">
        {/* Basic Info */}
        <section className="bg-card/50 rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="my-team"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={!!teamConfig}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Team description..."
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </section>

        {/* Agents */}
        <section className="bg-card/50 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Agents ({agents.length})
            </h2>
            <button
              onClick={handleAddAgent}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
            >
              <Plus className="w-4 h-4" />
              Add Agent
            </button>
          </div>

          <div className="space-y-4">
            {agents.map((agent, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-secondary/20 border border-border/50"
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-2" />
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Name</label>
                      <input
                        type="text"
                        value={agent.name}
                        onChange={(e) =>
                          handleAgentChange(index, 'name', e.target.value.toLowerCase())
                        }
                        placeholder="agent-name"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Role</label>
                      <input
                        type="text"
                        value={agent.role}
                        onChange={(e) => handleAgentChange(index, 'role', e.target.value)}
                        placeholder="Developer"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Model</label>
                      <select
                        value={agent.model}
                        onChange={(e) => handleAgentChange(index, 'model', e.target.value)}
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="opus">Opus</option>
                        <option value="sonnet">Sonnet</option>
                        <option value="haiku">Haiku</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Color</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={agent.color || '#6b7280'}
                          onChange={(e) => handleAgentChange(index, 'color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <input
                          type="text"
                          value={agent.color || ''}
                          onChange={(e) => handleAgentChange(index, 'color', e.target.value)}
                          placeholder="#hex"
                          className="flex-1 px-2 py-1 text-sm rounded bg-background border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Output File</label>
                      <input
                        type="text"
                        value={agent.output_file || ''}
                        onChange={(e) =>
                          handleAgentChange(index, 'output_file', e.target.value || null)
                        }
                        placeholder="output.md"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Permissions</label>
                      <select
                        value={agent.file_permissions}
                        onChange={(e) =>
                          handleAgentChange(index, 'file_permissions', e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="restricted">Restricted</option>
                        <option value="permissive">Permissive</option>
                        <option value="no_projects">No Projects</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4 col-span-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={agent.workflow_participant}
                          onChange={(e) =>
                            handleAgentChange(index, 'workflow_participant', e.target.checked)
                          }
                          className="rounded border-border"
                        />
                        <span className="text-foreground">Workflow Participant</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={agent.awaits_qa || false}
                          onChange={(e) =>
                            handleAgentChange(index, 'awaits_qa', e.target.checked)
                          }
                          className="rounded border-border"
                        />
                        <span className="text-foreground">Awaits QA</span>
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAgent(index)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    disabled={agents.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section className="bg-card/50 rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Workflow Configuration
          </h2>

          {/* Coordinator */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-foreground mb-1">
              Coordinator
            </label>
            <select
              value={coordinator}
              onChange={(e) => setCoordinator(e.target.value)}
              className="w-full md:w-64 px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select coordinator...</option>
              {agents.map((agent) => (
                <option key={agent.name} value={agent.name}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              The coordinator manages assignments and handoffs
            </p>
          </div>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-foreground">
                Phases ({phases.length})
              </label>
              <button
                onClick={handleAddPhase}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
              >
                <Plus className="w-4 h-4" />
                Add Phase
              </button>
            </div>

            <div className="space-y-3">
              {phases.map((phase, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20 border border-border/50"
                >
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Phase Name</label>
                      <input
                        type="text"
                        value={phase.name}
                        onChange={(e) => handlePhaseChange(index, 'name', e.target.value)}
                        placeholder="Research"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Owner</label>
                      <select
                        value={phase.owner}
                        onChange={(e) => handlePhaseChange(index, 'owner', e.target.value)}
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="">Select owner...</option>
                        {agents.map((agent) => (
                          <option key={agent.name} value={agent.name}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Output File</label>
                      <input
                        type="text"
                        value={phase.output}
                        onChange={(e) => handlePhaseChange(index, 'output', e.target.value)}
                        placeholder="output.md"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Requires</label>
                      <input
                        type="text"
                        value={(phase.requires || []).join(', ')}
                        onChange={(e) =>
                          handlePhaseChange(
                            index,
                            'requires',
                            e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        placeholder="context.md, research.md"
                        className="w-full px-2 py-1 text-sm rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemovePhase(index)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    disabled={phases.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
