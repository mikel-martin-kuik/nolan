import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Users, Radio, MessageSquare } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { AGENT_DESCRIPTIONS, isValidAgentName } from '@/types';

interface MessageFormProps {
  onMessageSent?: (target: string, message: string) => void;
}

interface TargetList {
  core_agents: string[];
  spawned_sessions: string[];
}

interface BroadcastResult {
  successful: string[];
  failed: string[];
  total: number;
}

export const MessageForm: React.FC<MessageFormProps> = ({ onMessageSent }) => {
  const [target, setTarget] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [availableTargets, setAvailableTargets] = useState<TargetList>({ core_agents: [], spawned_sessions: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toast = useToastStore();

  // Fetch available targets
  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const targets = await invoke<TargetList>('get_available_targets');
        setAvailableTargets(targets);
      } catch (err) {
        console.error('Failed to fetch targets:', err);
      }
    };

    fetchTargets();
    const interval = setInterval(fetchTargets, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleSend = async (sendTarget: string) => {
    if (!message.trim()) {
      toast.warning('Please enter a message');
      return;
    }

    try {
      setLoading(true);

      let result: string;

      if (sendTarget === 'team') {
        const response = await invoke<BroadcastResult>('broadcast_team', { message });
        result = `Broadcast to ${response.successful.length}/${response.total} team members`;
      } else if (sendTarget === 'all') {
        const response = await invoke<BroadcastResult>('broadcast_all', { message });
        result = `Broadcast to ${response.successful.length}/${response.total} agents`;
      } else {
        result = await invoke<string>('send_message', { target: sendTarget, message });
      }

      toast.success(result);
      onMessageSent?.(sendTarget, message); // Call callback first with current message
      setMessage(''); // Then clear message after callback
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to send message: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTarget = (selectedTarget: string) => {
    setTarget(selectedTarget);
    setShowDropdown(false);
  };

  const getTargetDisplay = () => {
    if (!target) return 'Select individual agent (optional)';

    // Check if it's a core agent
    const agentName = target.replace('agent-', '');
    if (availableTargets.core_agents.includes(agentName)) {
      return `${agentName.charAt(0).toUpperCase() + agentName.slice(1)}`;
    }

    // Otherwise it's a spawned session
    return target;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Send Message</h2>
      </div>

      {/* Individual target selection */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={loading}
          className="w-full bg-secondary/50 border border-border text-foreground rounded-xl px-4 py-2.5 text-left flex items-center justify-between hover:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-sm">{getTargetDisplay()}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* Custom dropdown - only individual agents */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-popover/95 backdrop-blur-xl border border-border rounded-2xl shadow-xl z-50 max-h-96 overflow-y-auto">
            <div className="p-2">
              {/* Core agents */}
              {availableTargets.core_agents.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-muted-foreground px-3 py-2 border-b border-border">
                    Core Agents
                  </div>
                  {availableTargets.core_agents.map((agent) => (
                    <button
                      key={agent}
                      onClick={() => handleSelectTarget(agent)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-xl text-left mt-1"
                    >
                      <div className="flex-1">
                        <span className="text-foreground capitalize font-medium">{agent}</span>
                        <p className="text-xs text-muted-foreground">
                          {isValidAgentName(agent) ? AGENT_DESCRIPTIONS[agent] : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Spawned sessions */}
              {availableTargets.spawned_sessions.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground px-3 py-2 border-b border-border">
                    Spawned Instances
                  </div>
                  {availableTargets.spawned_sessions.map((session) => {
                    const match = session.match(/^agent-([a-z]+)-([0-9]+)$/);
                    const agentName = match ? match[1] : null;
                    const instanceNum = match ? match[2] : null;

                    return (
                      <button
                        key={session}
                        onClick={() => handleSelectTarget(session.replace('agent-', ''))}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-xl text-left mt-1"
                      >
                        <div className="flex-1">
                          <span className="text-foreground font-medium">{session}</span>
                          {agentName && instanceNum && (
                            <p className="text-xs text-muted-foreground">
                              {isValidAgentName(agentName) ? `${AGENT_DESCRIPTIONS[agentName]} #${instanceNum}` : `#${instanceNum}`}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {availableTargets.core_agents.length === 0 && availableTargets.spawned_sessions.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No individual agents available
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Message input */}
      <div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          rows={4}
          className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          disabled={loading}
        />
      </div>

      {/* Send buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => target && handleSend(target)}
          disabled={loading || !target || !message.trim()}
          className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2
            bg-primary text-primary-foreground
            hover:bg-primary/90
            active:scale-95 transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          <span className="text-sm font-medium">Send</span>
        </button>
        <button
          onClick={() => handleSend('team')}
          disabled={loading || !message.trim()}
          className="h-10 px-4 rounded-xl flex items-center justify-center gap-2
            bg-secondary/50 border border-border text-foreground
            hover:bg-primary/10 hover:border-primary/20 hover:text-primary
            active:scale-95 transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-foreground"
        >
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">Core</span>
        </button>
        <button
          onClick={() => handleSend('all')}
          disabled={loading || !message.trim()}
          className="h-10 px-4 rounded-xl flex items-center justify-center gap-2
            bg-secondary/50 border border-border text-foreground
            hover:bg-purple-500/10 hover:border-purple-400/20 hover:text-purple-500
            active:scale-95 transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary/50 disabled:hover:border-border disabled:hover:text-foreground"
        >
          <Radio className="w-4 h-4" />
          <span className="text-sm font-medium">All</span>
        </button>
      </div>
    </div>
  );
};
