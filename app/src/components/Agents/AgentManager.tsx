import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { AgentCard } from './AgentCard';
import { AgentCreator } from './AgentCreator';
import { AgentEditor } from './AgentEditor';
import type { AgentDirectoryInfo } from '@/types';

export const AgentManager: React.FC = () => {
  const [agentDirs, setAgentDirs] = useState<AgentDirectoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editorAgent, setEditorAgent] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { error: showError, success: showSuccess } = useToastStore();

  // Fetch agent directories
  const fetchAgentDirs = useCallback(async () => {
    setLoading(true);
    try {
      const dirs = await invoke<AgentDirectoryInfo[]>('list_agent_directories');
      // Filter out ephemeral agents (agent-*)
      const filtered = dirs.filter(d => !d.name.startsWith('agent-'));
      setAgentDirs(filtered);
    } catch (err) {
      showError(`Failed to load agent directories: ${err}`);
      setAgentDirs([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Initial load
  useEffect(() => {
    fetchAgentDirs();
  }, [fetchAgentDirs]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchAgentDirs();
  }, [fetchAgentDirs]);

  // Handle agent creation
  const handleAgentCreated = useCallback(() => {
    setCreatorOpen(false);
    handleRefresh();
    showSuccess('Agent created successfully');
  }, [handleRefresh, showSuccess]);

  // Handle create CLAUDE.md
  const handleCreateClaudeMd = useCallback(async (agentName: string) => {
    try {
      const template = `# ${agentName}

## Role

Describe the role and responsibilities of this agent.

## Output

Document the expected output and format.

## Style

Outline communication style and guidelines.
`;
      await invoke('save_agent_role_file', {
        agentName,
        content: template
      });
      showSuccess(`CLAUDE.md created for ${agentName}`);
      handleRefresh();
    } catch (err) {
      showError(`Failed to create CLAUDE.md: ${err}`);
    }
  }, [showError, showSuccess, handleRefresh]);

  // Handle create agent.json
  const handleCreateAgentJson = useCallback(async (agentName: string) => {
    try {
      await invoke('save_agent_metadata', {
        agentName,
        role: 'Agent',
        model: 'sonnet'
      });
      showSuccess(`agent.json created for ${agentName}`);
      handleRefresh();
    } catch (err) {
      showError(`Failed to create agent.json: ${err}`);
    }
  }, [showError, showSuccess, handleRefresh]);

  // Handle agent edit (CLAUDE.md)
  const handleEdit = useCallback((agentName: string) => {
    setEditorAgent(agentName);
  }, []);

  // Handle agent editor save
  const handleEditorSave = useCallback(() => {
    setEditorAgent(null);
    showSuccess('Agent role file saved');
  }, [showSuccess]);

  // Handle delete request
  const handleDelete = useCallback((agentName: string) => {
    setDeleteConfirm(agentName);
  }, []);

  // Confirm delete
  const confirmDelete = useCallback(async (force: boolean = false) => {
    if (!deleteConfirm) return;

    try {
      await invoke('delete_agent_directory', {
        agentName: deleteConfirm,
        force
      });
      showSuccess(`Agent '${deleteConfirm}' deleted`);
      setDeleteConfirm(null);
      handleRefresh();
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('in use by team config') && !force) {
        // Show force delete option
        showError(`${err}`);
      } else {
        showError(`Failed to delete agent: ${err}`);
        setDeleteConfirm(null);
      }
    }
  }, [deleteConfirm, handleRefresh, showError, showSuccess]);

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agent Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage agent role definitions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setCreatorOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && agentDirs.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading agents...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && agentDirs.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No agents found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first agent to get started
            </p>
            <button
              onClick={() => setCreatorOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create Agent
            </button>
          </div>
        </div>
      )}

      {/* Agent grid */}
      {!loading && agentDirs.length > 0 && (
        <div className="flex-1 overflow-auto -mx-1 px-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-1">
            {agentDirs.map((agentDir) => (
              <AgentCard
                key={agentDir.name}
                agentInfo={agentDir}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCreateClaudeMd={handleCreateClaudeMd}
                onCreateAgentJson={handleCreateAgentJson}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agent Creator Modal */}
      {creatorOpen && (
        <AgentCreator
          onSave={handleAgentCreated}
          onCancel={() => setCreatorOpen(false)}
        />
      )}

      {/* Agent Editor Modal */}
      {editorAgent && (
        <AgentEditor
          agentName={editorAgent}
          onSave={handleEditorSave}
          onCancel={() => setEditorAgent(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">Delete Agent</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete agent '{deleteConfirm}'? This will remove the directory and all files.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(false)}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
