import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { useToastStore } from '../../store/toastStore';
import { Save, X, Plus, Trash2, GripVertical, Sparkles, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { TeamConfig, AgentConfig, PhaseConfig, AgentDirectoryInfo } from '@/types';
import { useOllamaStore } from '../../store/ollamaStore';

interface TeamEditorProps {
  teamConfig: TeamConfig | null;
  onSave: (teamName: string) => void;
  onCancel: () => void;
}

const DEFAULT_AGENT: AgentConfig = {
  name: '',
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
  const [generating, setGenerating] = useState(false);
  const { status: ollamaStatus, checkConnection, generate: ollamaGenerate } = useOllamaStore();

  // Form state
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [noteTaker, setNoteTaker] = useState('');
  const [exceptionHandler, setExceptionHandler] = useState('');
  const [phases, setPhases] = useState<PhaseConfig[]>([]);

  // Available agents from Agents page
  const [availableAgents, setAvailableAgents] = useState<AgentDirectoryInfo[]>([]);

  // Fetch available agents
  const fetchAvailableAgents = useCallback(async () => {
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      // Filter out ephemeral agents (agent-*), automation agents (cron-*, pred-*),
      // and incomplete agents (missing metadata)
      // Note: team-* agents ARE included (designed for traditional team workflows)
      const excludedPrefixes = ['agent-', 'cron-', 'pred-'];
      const filtered = dirs.filter(d =>
        d.role && d.model && !excludedPrefixes.some(prefix => d.name.startsWith(prefix))
      );
      setAvailableAgents(filtered);
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }, []);

  // Fetch agents on mount
  useEffect(() => {
    fetchAvailableAgents();
  }, [fetchAvailableAgents]);

  // Check Ollama connection
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Generate team description using Ollama
  const handleGenerateDescription = async () => {
    if (!name.trim()) {
      showError('Enter a team name first');
      return;
    }
    setGenerating(true);
    try {
      const agentList = agents.filter(a => a.name).map(a => {
        const info = getAgentInfo(a.name);
        return `${a.name} (${info?.role || 'unknown role'})`;
      }).join(', ');

      const systemPrompt = `You are an organizational designer. Generate a concise team description that explains the team's purpose, composition, and how members collaborate to achieve goals. Keep it to 1-2 sentences.`;
      const prompt = `Generate a description for a team named "${name}"${agentList ? ` with members: ${agentList}` : ''}${description.trim() ? `\n\nCurrent description to improve: "${description}"` : ''}`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      setDescription(result.trim());
    } catch (err) {
      showError(`Failed to generate: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  // Initialize form from existing config
  useEffect(() => {
    if (teamConfig) {
      setName(teamConfig.team.name);
      setOriginalName(teamConfig.team.name);
      setDescription(teamConfig.team.description || '');
      setAgents([...teamConfig.team.agents]);
      setNoteTaker(teamConfig.team.workflow.note_taker || '');
      setExceptionHandler(teamConfig.team.workflow.exception_handler || '');
      setPhases([...teamConfig.team.workflow.phases]);
    } else {
      // Default for new team
      setName('');
      setOriginalName(null);
      setDescription('');
      setAgents([{ ...DEFAULT_AGENT }]);
      setNoteTaker('');
      setExceptionHandler('');
      setPhases([{ ...DEFAULT_PHASE }]);
    }
  }, [teamConfig]);

  const handleAddAgent = () => {
    setAgents([
      ...agents,
      { ...DEFAULT_AGENT },
    ]);
  };

  // Handle agent selection from dropdown
  const handleAgentSelect = (index: number, agentName: string) => {
    const selectedAgent = availableAgents.find(a => a.name === agentName);
    const newAgents = [...agents];
    newAgents[index] = {
      ...newAgents[index],
      name: selectedAgent?.name || '',
    };
    setAgents(newAgents);
  };

  // Get agent info from availableAgents for display (role/model come from agent.json)
  const getAgentInfo = (agentName: string) => {
    return availableAgents.find(a => a.name === agentName);
  };

  // Get agents not yet added to the team
  const getAvailableAgentsForSelection = (currentIndex: number) => {
    const usedNames = agents
      .filter((_, i) => i !== currentIndex)
      .map(a => a.name);
    return availableAgents.filter(a => !usedNames.includes(a.name));
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
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return 'Team name must start with lowercase letter, contain only lowercase letters, numbers, and underscores';
    }
    if (agents.length === 0) return 'At least one agent is required';

    for (const agent of agents) {
      if (!agent.name.trim()) return 'All agents must have a name';
      if (!/^[a-z][a-z0-9_]*$/.test(agent.name)) {
        return `Agent name '${agent.name}' is invalid. Use lowercase letters, numbers, and underscores only.`;
      }
      // Role and model come from agent.json, validated in getAvailableAgentsForSelection
    }

    const agentNames = agents.map((a) => a.name);
    const uniqueNames = new Set(agentNames);
    if (uniqueNames.size !== agentNames.length) {
      return 'Agent names must be unique';
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
      // If editing an existing team and name changed, rename the file first
      if (originalName && originalName !== name) {
        await invoke('rename_team_config', { old_name: originalName, new_name: name });
      }

      // Convert "__none__" placeholder back to undefined
      const noteTakerValue = noteTaker && noteTaker !== '__none__' ? noteTaker : undefined;
      const exceptionHandlerValue = exceptionHandler && exceptionHandler !== '__none__' ? exceptionHandler : undefined;

      const config: TeamConfig = {
        team: {
          name,
          description: description || undefined,
          version: '1.0.0',
          agents,
          workflow: {
            note_taker: noteTakerValue,
            exception_handler: exceptionHandlerValue,
            phases,
          },
        },
      };

      await invoke('save_team_config', { team_name: name, config });
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
          <Button variant="secondary" onClick={onCancel}>
            <X />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save />
            {saving ? 'Saving...' : 'Save'}
          </Button>
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
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="my-team"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {originalName ? 'Changing name will rename the config file' : 'Lowercase letters, numbers, and underscores only'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <div className="flex gap-2">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Team description..."
                  disabled={generating}
                  className="flex-1"
                />
                {ollamaStatus === 'connected' && (
                  <Tooltip content="Generate description using local AI" side="top">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerateDescription}
                      disabled={generating || saving || !name.trim()}
                      className="shrink-0"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Agents */}
        <section className="bg-card/50 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Agents ({agents.length})
            </h2>
            <Button variant="link" size="sm" onClick={handleAddAgent} className="h-auto p-0">
              <Plus />
              Add Agent
            </Button>
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
                    <div className="col-span-2">
                      <Tooltip content="Select from agents created on the Agents page" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Agent</label>
                      </Tooltip>
                      <Select
                        value={agent.name || undefined}
                        onValueChange={(value) => handleAgentSelect(index, value)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm">
                          <SelectValue placeholder="Select agent..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableAgentsForSelection(index).map((availAgent) => (
                            <SelectItem key={availAgent.name} value={availAgent.name}>
                              {availAgent.name} ({availAgent.role})
                            </SelectItem>
                          ))}
                          {/* Include currently selected agent if it's not in available list */}
                          {agent.name && !getAvailableAgentsForSelection(index).find(a => a.name === agent.name) && (
                            <SelectItem value={agent.name}>
                              {agent.name}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {agent.name && getAgentInfo(agent.name) && (
                      <div className="col-span-2 flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Role:</span>
                        <span className="text-foreground">{getAgentInfo(agent.name)?.role}</span>
                        <span className="text-muted-foreground ml-4">Model:</span>
                        <span className="text-foreground capitalize">{getAgentInfo(agent.name)?.model}</span>
                      </div>
                    )}
                    <div>
                      <Tooltip content="File this agent writes output to in the project directory" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Output File</label>
                      </Tooltip>
                      <Input
                        value={agent.output_file || ''}
                        onChange={(e) =>
                          handleAgentChange(index, 'output_file', e.target.value || null)
                        }
                        placeholder="output.md"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Tooltip content="File access permissions for this agent" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Permissions</label>
                      </Tooltip>
                      <Select
                        value={agent.file_permissions}
                        onValueChange={(value) =>
                          handleAgentChange(index, 'file_permissions', value)
                        }
                      >
                        <SelectTrigger className="w-full h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restricted">Restricted</SelectItem>
                          <SelectItem value="permissive">Permissive</SelectItem>
                          <SelectItem value="no_projects">No Projects</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4 col-span-2">
                      <Tooltip content="Include in core workflow and broadcast groups" side="top">
                        <label className="flex items-center gap-2 text-sm cursor-help">
                          <Checkbox
                            checked={agent.workflow_participant}
                            onCheckedChange={(checked) =>
                              handleAgentChange(index, 'workflow_participant', checked)
                            }
                          />
                          <span className="text-foreground">Workflow Participant</span>
                        </label>
                      </Tooltip>
                      <Tooltip content="Require QA review before completing phase" side="top">
                        <label className="flex items-center gap-2 text-sm cursor-help">
                          <Checkbox
                            checked={agent.awaits_qa || false}
                            onCheckedChange={(checked) =>
                              handleAgentChange(index, 'awaits_qa', checked)
                            }
                          />
                          <span className="text-foreground">Awaits QA</span>
                        </label>
                      </Tooltip>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAgent(index)}
                    disabled={agents.length <= 1}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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

          {/* Workflow Roles - automated progression, these handle documentation and exceptions */}
          <p className="text-xs text-muted-foreground mb-4">
            Workflow progression is automated via hooks. These roles handle documentation and exceptions.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Note-taker */}
            <div>
              <Tooltip content="Agent that documents workflow progress and maintains project notes" side="right">
                <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                  Note-taker
                </label>
              </Tooltip>
              <Select
                value={noteTaker || '__none__'}
                onValueChange={setNoteTaker}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select note-taker (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {agents.filter(a => a.name).map((agent) => (
                    <SelectItem key={agent.name} value={agent.name}>
                      {agent.name} {getAgentInfo(agent.name)?.role ? `(${getAgentInfo(agent.name)?.role})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exception Handler */}
            <div>
              <Tooltip content="Agent that escalates workflow issues to human (optional)" side="right">
                <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                  Exception Handler
                </label>
              </Tooltip>
              <Select
                value={exceptionHandler || '__none__'}
                onValueChange={setExceptionHandler}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select handler (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {agents.filter(a => a.name).map((agent) => (
                    <SelectItem key={agent.name} value={agent.name}>
                      {agent.name} {getAgentInfo(agent.name)?.role ? `(${getAgentInfo(agent.name)?.role})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Phases */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-foreground">
                Phases ({phases.length})
              </label>
              <Button variant="link" size="sm" onClick={handleAddPhase} className="h-auto p-0">
                <Plus />
                Add Phase
              </Button>
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
                      <Tooltip content="Name displayed in workflow status" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Phase Name</label>
                      </Tooltip>
                      <Input
                        value={phase.name}
                        onChange={(e) => handlePhaseChange(index, 'name', e.target.value)}
                        placeholder="Research"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Tooltip content="Agent responsible for completing this phase" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Owner</label>
                      </Tooltip>
                      <Select
                        value={phase.owner || undefined}
                        onValueChange={(value) => handlePhaseChange(index, 'owner', value)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm">
                          <SelectValue placeholder="Select owner..." />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.filter(a => a.name).map((agent) => (
                            <SelectItem key={agent.name} value={agent.name}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Tooltip content="File the owner creates upon completing this phase" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Output File</label>
                      </Tooltip>
                      <Input
                        value={phase.output}
                        onChange={(e) => handlePhaseChange(index, 'output', e.target.value)}
                        placeholder="output.md"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Tooltip content="Files that must exist before this phase can start" side="top">
                        <label className="block text-xs text-muted-foreground mb-1 w-fit cursor-help">Requires</label>
                      </Tooltip>
                      <Input
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
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePhase(index)}
                    disabled={phases.length <= 1}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
