import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../shared/Button';
import { useToastStore } from '../../store/toastStore';

interface MessageFormProps {
  onMessageSent?: (target: string, message: string) => void;
}

interface TargetList {
  core_agents: string[];
  spawned_sessions: string[];
}

export const MessageForm: React.FC<MessageFormProps> = ({ onMessageSent }) => {
  const [target, setTarget] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [availableTargets, setAvailableTargets] = useState<TargetList>({ core_agents: [], spawned_sessions: [] });
  const toast = useToastStore();

  // Fetch available targets
  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const targets = await invoke<TargetList>('get_available_targets');
        setAvailableTargets(targets);

        // Set default target to first available agent
        if (targets.core_agents.length > 0 && !target) {
          setTarget(targets.core_agents[0]);
        }
      } catch (err) {
        console.error('Failed to fetch targets:', err);
      }
    };

    fetchTargets();
    const interval = setInterval(fetchTargets, 3000);
    return () => clearInterval(interval);
  }, [target]);

  const handleSend = async () => {
    if (!target || !message.trim()) {
      toast.warning('Please select a target and enter a message');
      return;
    }

    try {
      setLoading(true);

      let result: string;

      if (target === 'team') {
        const response = await invoke<any>('broadcast_team', { message });
        result = `Broadcast to ${response.successful.length}/${response.total} team members`;
      } else if (target === 'all') {
        const response = await invoke<any>('broadcast_all', { message });
        result = `Broadcast to ${response.successful.length} agents`;
      } else {
        result = await invoke<string>('send_message', { target, message });
      }

      toast.success(result);
      setMessage(''); // Clear message after successful send
      onMessageSent?.(target, message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to send message: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Ctrl+Enter to send
    if (e.ctrlKey && e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="space-y-4">
      {/* Target selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Select Target
        </label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&>option]:bg-gray-700 [&>option]:text-white [&>optgroup]:bg-gray-700 [&>optgroup]:text-white"
          disabled={loading}
        >
          <option value="" className="bg-gray-700 text-white">-- Select Target --</option>

          {/* Broadcast options */}
          <optgroup label="Broadcast" className="bg-gray-700 text-white">
            <option value="team" className="bg-gray-700 text-white">📢 Core Team (Ana, Bill, Carl, Dan, Enzo)</option>
            <option value="all" className="bg-gray-700 text-white">📢 All Active Agents</option>
          </optgroup>

          {/* Core agents */}
          {availableTargets.core_agents.length > 0 && (
            <optgroup label="Core Agents" className="bg-gray-700 text-white">
              {availableTargets.core_agents.map((agent) => (
                <option key={agent} value={agent} className="bg-gray-700 text-white">
                  👤 {agent.charAt(0).toUpperCase() + agent.slice(1)}
                </option>
              ))}
            </optgroup>
          )}

          {/* Spawned sessions */}
          {availableTargets.spawned_sessions.length > 0 && (
            <optgroup label="Spawned Instances" className="bg-gray-700 text-white">
              {availableTargets.spawned_sessions.map((session) => (
                <option key={session} value={session.replace('agent-', '')} className="bg-gray-700 text-white">
                  🔸 {session}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Message input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type your message here... (Ctrl+Enter to send)"
          rows={4}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <p className="text-xs text-gray-500 mt-1">
          Tip: Press Ctrl+Enter to send
        </p>
      </div>

      {/* Send button */}
      <Button
        onClick={handleSend}
        disabled={loading || !target || !message.trim()}
        variant="primary"
        className="w-full"
      >
        {loading ? 'Sending...' : 'Send Message'}
      </Button>
    </div>
  );
};
