import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import type { ClaudeModel } from '@/types';

interface AgentCreatorProps {
  onSave: () => void;
  onCancel: () => void;
}

export const AgentCreator: React.FC<AgentCreatorProps> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [creating, setCreating] = useState(false);
  const { error: showError } = useToastStore();

  // Validate agent name format
  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return 'Agent name is required';
    }
    if (!/^[a-z]/.test(name)) {
      return 'Agent name must start with a lowercase letter';
    }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return 'Agent name must contain only lowercase letters, digits, and hyphens';
    }
    return null;
  };

  const handleCreate = async () => {
    // Validate inputs
    const nameError = validateName(name);
    if (nameError) {
      showError(nameError);
      return;
    }

    if (!role.trim()) {
      showError('Role is required');
      return;
    }

    setCreating(true);
    try {
      // Step 1: Get template
      const template = await invoke<string>('get_agent_template', {
        agentName: name,
        role: role
      });

      // Step 2: Create directory
      await invoke('create_agent_directory', {
        agentName: name
      });

      // Step 3: Save CLAUDE.md
      await invoke('save_agent_role_file', {
        agentName: name,
        content: template
      });

      // Step 4: Save agent metadata (role and model)
      await invoke('save_agent_metadata', {
        agentName: name,
        role: role,
        model: model
      });

      onSave();
    } catch (err) {
      showError(`Failed to create agent: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-lg w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create New Agent</h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Agent Name */}
          <div>
            <Tooltip content="Unique identifier used in directories and team configs" side="right">
              <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                Agent Name
              </label>
            </Tooltip>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="my-agent"
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Role */}
          <div>
            <Tooltip content="Describes the agent's responsibilities in the team" side="right">
              <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                Role Description
              </label>
            </Tooltip>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Researcher, Developer, QA Reviewer"
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={creating}
            />
          </div>

          {/* Model */}
          <div>
            <Tooltip content="Claude model used when launching this agent" side="right">
              <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                Model
              </label>
            </Tooltip>
            <Select
              value={model}
              onValueChange={(value) => setModel(value as ClaudeModel)}
              disabled={creating}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus (Powerful)</SelectItem>
                <SelectItem value="sonnet">Sonnet (Balanced)</SelectItem>
                <SelectItem value="haiku">Haiku (Fast)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Info box */}
          <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              This will create a new directory at <code className="text-foreground">app/agents/{name || '[name]'}/</code> with a CLAUDE.md role file template.
              You can edit the role file after creation.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button
            onClick={onCancel}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
};
