import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { X, Save, RotateCcw } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { AgentDirectoryInfo } from '@/types';

interface AgentEditorProps {
  agentName: string;
  onSave: () => void;
  onCancel: () => void;
}

export const AgentEditor: React.FC<AgentEditorProps> = ({
  agentName,
  onSave,
  onCancel,
}) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [role, setRole] = useState('');
  const [originalRole, setOriginalRole] = useState('');
  const [model, setModel] = useState('sonnet');
  const [originalModel, setOriginalModel] = useState('sonnet');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { error: showError, success: showSuccess } = useToastStore();

  // Load CLAUDE.md content and agent metadata
  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      // Load CLAUDE.md
      const fileContent = await invoke<string>('get_agent_role_file', {
        agentName
      });
      setContent(fileContent);
      setOriginalContent(fileContent);

      // Load agent metadata (role and model)
      try {
        const agents = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
        const agent = agents.find(a => a.name === agentName);
        if (agent) {
          setRole(agent.role || '');
          setOriginalRole(agent.role || '');
          setModel(agent.model || 'sonnet');
          setOriginalModel(agent.model || 'sonnet');
        }
      } catch {
        // Agent metadata may not exist
      }

      setHasChanges(false);
    } catch (err) {
      showError(`Failed to load CLAUDE.md: ${err}`);
      onCancel();
    } finally {
      setLoading(false);
    }
  }, [agentName, showError, onCancel]);

  // Load on mount
  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent || role !== originalRole || model !== originalModel);
  }, [content, originalContent, role, originalRole, model, originalModel]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      showError('CLAUDE.md content cannot be empty');
      return;
    }

    setSaving(true);
    try {
      // Save CLAUDE.md
      await invoke('save_agent_role_file', {
        agentName,
        content
      });

      // Save metadata if role or model changed
      if (role !== originalRole || model !== originalModel) {
        await invoke('save_agent_metadata', {
          agentName,
          role: role || 'Agent',
          model,
        });
        setOriginalRole(role);
        setOriginalModel(model);
      }

      showSuccess('Agent saved successfully');
      setOriginalContent(content);
      setHasChanges(false);
      onSave();
    } catch (err) {
      showError(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  }, [agentName, content, role, originalRole, model, originalModel, showError, showSuccess, onSave]);

  // Handle revert
  const handleRevert = useCallback(() => {
    setContent(originalContent);
    setRole(originalRole);
    setModel(originalModel);
    setHasChanges(false);
  }, [originalContent, originalRole, originalModel]);

  // Handle cancel with unsaved changes warning
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onCancel();
      }
    } else {
      onCancel();
    }
  }, [hasChanges, onCancel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSave();
        }
      }
      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, saving, handleSave, handleCancel]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex-1 mr-4">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-semibold text-foreground">
                {agentName}
              </h2>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role (e.g., Research, Planning)"
                className="flex-1 max-w-xs h-8 text-sm"
              />
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-28 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opus">Opus</SelectItem>
                  <SelectItem value="sonnet">Sonnet</SelectItem>
                  <SelectItem value="haiku">Haiku</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              CLAUDE.md
              {hasChanges && <span className="ml-2 text-yellow-500">• Unsaved changes</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button variant="secondary" size="sm" onClick={handleRevert} disabled={saving}>
                <RotateCcw />
                Revert
              </Button>
            )}
            <Button onClick={handleSave} disabled={!hasChanges || saving}>
              <Save />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <X className="w-5 h-5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full font-mono"
              placeholder="Enter CLAUDE.md content..."
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0 bg-muted/30">
          <div className="text-xs text-muted-foreground">
            <span>Press </span>
            <kbd className="px-2 py-1 bg-background border border-border rounded text-foreground font-mono">
              Ctrl+S
            </kbd>
            <span> to save • </span>
            <kbd className="px-2 py-1 bg-background border border-border rounded text-foreground font-mono">
              Esc
            </kbd>
            <span> to close</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {content.split('\n').length} lines • {content.length} characters
          </div>
        </div>
      </div>
    </div>
  );
};
