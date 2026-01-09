import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@/lib/api';
import { ChevronDown, Search, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TargetList {
  core_agents: string[];
  spawned_sessions: string[];
}

interface AgentSelectorProps {
  onSelect: (agentName: string) => void;
  disabled?: boolean;
  selected?: string;
  placeholder?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  onSelect,
  disabled = false,
  selected,
  placeholder = 'Select agent...',
}) => {
  const [targets, setTargets] = useState<TargetList>({ core_agents: [], spawned_sessions: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available targets
  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<TargetList>('get_available_targets');
      setTargets(result);
    } catch (err) {
      console.error('Failed to fetch available targets:', err);
      setTargets({ core_agents: [], spawned_sessions: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when dropdown opens
  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Refresh when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchTargets();
    }
  }, [isOpen, fetchTargets]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Filter agents based on search query
  const filterAgents = (agents: string[]) => {
    if (!searchQuery.trim()) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter((agent) => agent.toLowerCase().includes(query));
  };

  const filteredCoreAgents = filterAgents(targets.core_agents);
  const filteredSpawned = filterAgents(targets.spawned_sessions.map(s => s.replace(/^agent-/, '')));

  const handleSelect = (agent: string) => {
    onSelect(agent);
    setIsOpen(false);
    setSearchQuery('');
  };

  const hasResults = filteredCoreAgents.length > 0 || filteredSpawned.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2',
          'px-3 py-2 rounded-lg border border-input bg-background',
          'text-sm text-foreground',
          'hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors'
        )}
      >
        <span className={cn(
          selected ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {selected || placeholder}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border bg-card/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading agents...
            </div>
          )}

          {/* Results */}
          {!loading && (
            <div className="max-h-64 overflow-y-auto">
              {!hasResults && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim() ? 'No matching agents' : 'No agents available'}
                </div>
              )}

              {/* Core agents section */}
              {filteredCoreAgents.length > 0 && (
                <div className="p-1">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Core Agents
                  </div>
                  {filteredCoreAgents.map((agent) => (
                    <button
                      key={agent}
                      type="button"
                      onClick={() => handleSelect(agent)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm',
                        'hover:bg-accent hover:text-accent-foreground',
                        'transition-colors',
                        selected === agent && 'bg-accent/50'
                      )}
                    >
                      <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                      <span>{agent}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Spawned instances section */}
              {filteredSpawned.length > 0 && (
                <div className="p-1">
                  {filteredCoreAgents.length > 0 && (
                    <div className="h-px bg-border my-1" />
                  )}
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Spawned Instances
                  </div>
                  {filteredSpawned.map((agent) => (
                    <button
                      key={agent}
                      type="button"
                      onClick={() => handleSelect(agent)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm',
                        'hover:bg-accent hover:text-accent-foreground',
                        'transition-colors',
                        selected === agent && 'bg-accent/50'
                      )}
                    >
                      <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                      <span>{agent}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
