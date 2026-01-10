import React, { useState } from 'react';
import { invoke } from '@/lib/api';
import { useToastStore } from '../../store/toastStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return 'Agent name must contain only lowercase letters, digits, and underscores';
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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>

        {/* Form */}
        <div className="space-y-4">
          {/* Agent Name */}
          <div>
            <Tooltip content="Unique identifier used in directories and team configs" side="right">
              <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                Agent Name
              </label>
            </Tooltip>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="my_agent"
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, and underscores only
            </p>
          </div>

          {/* Role */}
          <div>
            <Tooltip content="Describes the agent's responsibilities in the team" side="right">
              <label className="block text-sm font-medium text-foreground mb-1 w-fit cursor-help">
                Role Description
              </label>
            </Tooltip>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Researcher, Developer, QA Reviewer"
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

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
