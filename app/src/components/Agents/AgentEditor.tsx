import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Save, RotateCcw, Sparkles, Loader2 } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { useOllamaStore } from '../../store/ollamaStore';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  const [model, setModel] = useState('opus');
  const [originalModel, setOriginalModel] = useState('opus');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const { error: showError, success: showSuccess } = useToastStore();
  const { status: ollamaStatus, checkConnection, generate: ollamaGenerate } = useOllamaStore();

  // Load CLAUDE.md content and agent metadata
  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      // Load CLAUDE.md
      const fileContent = await invoke<string | { content: string }>('get_agent_role_file', {
        agent_name: agentName
      });
      // Handle both raw string (HTTP API) and wrapped object (legacy)
      const contentStr = typeof fileContent === 'string' ? fileContent : fileContent?.content ?? '';
      setContent(contentStr);
      setOriginalContent(contentStr);

      // Load agent metadata (role and model)
      try {
        const agents = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
        const agent = agents.find(a => a.name === agentName);
        if (agent) {
          setRole(agent.role || '');
          setOriginalRole(agent.role || '');
          setModel(agent.model || 'opus');
          setOriginalModel(agent.model || 'opus');
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

  // Check Ollama connection
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Generate CLAUDE.md content using Ollama
  const handleGenerateContent = async () => {
    if (!agentName) {
      showError('Agent name is required');
      return;
    }
    setGenerating(true);
    try {
      const systemPrompt = `You are a technical writer specializing in AI agent role definitions. Generate clear, actionable CLAUDE.md content for an AI agent. Focus on: role description, responsibilities, input/output expectations, and behavioral guidelines. Keep it concise and professional. Use markdown formatting.`;
      const prompt = `Generate CLAUDE.md content for an AI agent named "${agentName}"${role ? ` with role: "${role}"` : ''}${content.trim() ? `\n\nCurrent content to improve:\n${content}` : ''}`;
      const result = await ollamaGenerate(prompt, systemPrompt);
      setContent(result.trim());
    } catch (err) {
      showError(`Failed to generate: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

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
        agent_name: agentName,
        content
      });

      // Save metadata if role or model changed
      if (role !== originalRole || model !== originalModel) {
        await invoke('save_agent_metadata', {
          agent_name: agentName,
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
      setDiscardConfirmOpen(true);
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
    <>
      <Dialog open={true} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
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
            <div className="flex items-center gap-2 mr-6">
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
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden p-4 flex flex-col">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <>
                {ollamaStatus === 'connected' && (
                  <div className="flex justify-end mb-2">
                    <Tooltip content="Generate/improve content using local AI" side="left">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateContent}
                        disabled={generating || saving}
                        className="gap-2"
                      >
                        {generating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {generating ? 'Generating...' : 'Generate with AI'}
                      </Button>
                    </Tooltip>
                  </div>
                )}
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full flex-1 font-mono"
                  placeholder="Enter CLAUDE.md content..."
                  spellCheck={false}
                  disabled={generating}
                />
              </>
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
              {(content || '').split('\n').length} lines • {(content || '').length} characters
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
