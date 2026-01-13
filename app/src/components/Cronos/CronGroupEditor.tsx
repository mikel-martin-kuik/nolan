import React, { useState, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { useToastStore } from '../../store/toastStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import type { CronAgentGroup, CronAgentInfo } from '@/types';

interface CronGroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CronAgentGroup[];
  agents: CronAgentInfo[];
  onGroupsChange: () => void;
  onAgentsChange: () => void;
}

export const CronGroupEditor: React.FC<CronGroupEditorProps> = ({
  open,
  onOpenChange,
  groups,
  agents,
  onGroupsChange,
  onAgentsChange,
}) => {
  const { error: showError, success: showSuccess } = useToastStore();

  // Edit group state
  const [editingGroup, setEditingGroup] = useState<CronAgentGroup | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formOrder, setFormOrder] = useState(0);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Agent assignment state
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // Reset form
  const resetForm = useCallback(() => {
    setFormId('');
    setFormName('');
    setFormOrder(groups.length + 1);
    setEditingGroup(null);
    setIsCreating(false);
  }, [groups.length]);

  // Open create form
  const openCreateForm = useCallback(() => {
    resetForm();
    setIsCreating(true);
    setFormOrder(groups.length + 1);
  }, [resetForm, groups.length]);

  // Open edit form
  const openEditForm = useCallback((group: CronAgentGroup) => {
    setEditingGroup(group);
    setFormId(group.id);
    setFormName(group.name);
    setFormOrder(group.order);
    setIsCreating(false);
  }, []);

  // Handle create group
  const handleCreateGroup = useCallback(async () => {
    if (!formId.trim() || !formName.trim()) {
      showError('Group ID and name are required');
      return;
    }

    const group: CronAgentGroup = {
      id: formId.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      name: formName,
      order: formOrder,
    };

    try {
      await invoke('create_cron_group', { group });
      showSuccess(`Created group: ${formName}`);
      onGroupsChange();
      resetForm();
    } catch (err) {
      showError(`Failed to create group: ${err}`);
    }
  }, [formId, formName, formOrder, showError, showSuccess, onGroupsChange, resetForm]);

  // Handle update group
  const handleUpdateGroup = useCallback(async () => {
    if (!editingGroup) return;

    const group: CronAgentGroup = {
      id: editingGroup.id, // Can't change ID
      name: formName,
      order: formOrder,
    };

    try {
      await invoke('update_cron_group', { group });
      showSuccess(`Updated group: ${formName}`);
      onGroupsChange();
      resetForm();
    } catch (err) {
      showError(`Failed to update group: ${err}`);
    }
  }, [editingGroup, formName, formOrder, showError, showSuccess, onGroupsChange, resetForm]);

  // Handle delete group
  const handleDeleteGroup = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      await invoke('delete_cron_group', { group_id: deleteConfirm });
      showSuccess('Group deleted');
      onGroupsChange();
      setDeleteConfirm(null);
    } catch (err) {
      showError(`Failed to delete group: ${err}`);
    }
  }, [deleteConfirm, showError, showSuccess, onGroupsChange]);

  // Handle assign agent to group
  const handleAssignAgent = useCallback(async () => {
    if (!selectedAgent) {
      showError('Please select an agent');
      return;
    }

    try {
      await invoke('set_agent_group', {
        agent_name: selectedAgent,
        group_id: selectedGroup || null,
      });
      showSuccess(`Updated agent group assignment`);
      onAgentsChange();
      setSelectedAgent('');
      setSelectedGroup('');
    } catch (err) {
      showError(`Failed to assign agent: ${err}`);
    }
  }, [selectedAgent, selectedGroup, showError, showSuccess, onAgentsChange]);

  // Get agents for a group
  const getGroupAgents = (groupId: string) => {
    return agents.filter(a => a.group === groupId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Agent Groups</DialogTitle>
            <DialogDescription>
              Organize your agents into groups for better management
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="groups" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="groups">Groups</TabsTrigger>
              <TabsTrigger value="assign">Assign Agents</TabsTrigger>
            </TabsList>

            {/* Groups Tab */}
            <TabsContent value="groups" className="flex-1 overflow-auto mt-4">
              <div className="space-y-4">
                {/* Group list */}
                <div className="space-y-2">
                  {groups.map((group) => {
                    const groupAgents = getGroupAgents(group.id);
                    const isEditing = editingGroup?.id === group.id;

                    return (
                      <div
                        key={group.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          isEditing ? 'border-primary bg-primary/5' : 'border-border/50 hover:bg-secondary/20'
                        }`}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{group.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {group.id}
                            </Badge>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {groupAgents.length} agents
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditForm(group)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(group.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}

                  {groups.length === 0 && !isCreating && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No groups defined yet</p>
                      <p className="text-sm mt-1">Create your first group to organize agents</p>
                    </div>
                  )}
                </div>

                {/* Create/Edit form */}
                {(isCreating || editingGroup) && (
                  <div className="border border-border rounded-lg p-4 space-y-4 bg-secondary/10">
                    <h4 className="font-medium">
                      {isCreating ? 'Create New Group' : `Edit: ${editingGroup?.name}`}
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Group ID</label>
                        <Input
                          className="mt-1"
                          placeholder="e.g., monitoring"
                          value={formId}
                          onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          disabled={!!editingGroup}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Lowercase letters, numbers, and hyphens only
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Display Name</label>
                        <Input
                          className="mt-1"
                          placeholder="e.g., Monitoring"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Order</label>
                        <Input
                          type="number"
                          className="mt-1"
                          min={1}
                          value={formOrder}
                          onChange={(e) => setFormOrder(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={resetForm}>
                        Cancel
                      </Button>
                      <Button onClick={isCreating ? handleCreateGroup : handleUpdateGroup}>
                        {isCreating ? 'Create' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Add button */}
                {!isCreating && !editingGroup && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={openCreateForm}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Group
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Assign Agents Tab */}
            <TabsContent value="assign" className="flex-1 overflow-auto mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Agent</label>
                    <Select
                      value={selectedAgent}
                      onValueChange={setSelectedAgent}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((agent) => (
                          <SelectItem key={agent.name} value={agent.name}>
                            {agent.name}
                            {agent.group && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({agent.group})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Assign to Group</label>
                    <Select
                      value={selectedGroup || '__none__'}
                      onValueChange={(val) => setSelectedGroup(val === '__none__' ? '' : val)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No group (ungrouped)</SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleAssignAgent} disabled={!selectedAgent}>
                  Assign Agent
                </Button>

                {/* Current assignments */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Current Assignments</h4>
                  <div className="space-y-2">
                    {groups.map((group) => {
                      const groupAgents = getGroupAgents(group.id);
                      if (groupAgents.length === 0) return null;

                      return (
                        <div key={group.id} className="border border-border/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{group.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {groupAgents.map((agent) => (
                              <Badge
                                key={agent.name}
                                variant="secondary"
                                className="text-xs"
                              >
                                {agent.name.replace('cron-', '')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Ungrouped */}
                    {agents.filter(a => !a.group).length > 0 && (
                      <div className="border border-border/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-sm">Ungrouped</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {agents.filter(a => !a.group).map((agent) => (
                            <Badge
                              key={agent.name}
                              variant="outline"
                              className="text-xs"
                            >
                              {agent.name.replace('cron-', '')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the group. Agents in this group will become ungrouped.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteGroup}>Delete</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
