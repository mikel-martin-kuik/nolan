import React, { useState } from 'react';
import { MessageForm } from './MessageForm';
import { QuickActions } from './QuickActions';

interface SentMessage {
  target: string;
  message: string;
  timestamp: number;
}

export const CommunicatorPanel: React.FC = () => {
  const [messageHistory, setMessageHistory] = useState<SentMessage[]>([]);
  const [quickMessage, setQuickMessage] = useState<string>('');

  const handleMessageSent = (target: string, message: string) => {
    const newMessage: SentMessage = {
      target,
      message,
      timestamp: Date.now(),
    };

    // Add to history (keep last 10)
    setMessageHistory((prev) => [newMessage, ...prev].slice(0, 10));
  };

  const handleQuickMessage = (message: string) => {
    setQuickMessage(message);
    // Scroll to message form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Reset quick message when MessageForm is rendered
  React.useEffect(() => {
    if (quickMessage) {
      // Give MessageForm time to mount, then clear
      setTimeout(() => setQuickMessage(''), 100);
    }
  }, [quickMessage]);

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Communicator</h1>
          <p className="text-sm text-gray-400 mt-1">
            Send messages to agents via tmux sessions
          </p>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Message form */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Send Message</h2>
            <MessageForm
              onMessageSent={handleMessageSent}
              key={quickMessage} // Force re-render when quick message changes
            />
          </div>

          {/* Right column: Quick actions */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <QuickActions onQuickMessage={handleQuickMessage} />
          </div>
        </div>

        {/* Message history */}
        {messageHistory.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Message History (Last 10)
            </h2>

            <div className="space-y-3">
              {messageHistory.map((msg, index) => (
                <div
                  key={index}
                  className="bg-gray-700 border border-gray-600 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-blue-400">
                        {msg.target === 'team' && '📢 Team'}
                        {msg.target === 'all' && '📢 All'}
                        {msg.target !== 'team' && msg.target !== 'all' && `👤 ${msg.target}`}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatTimestamp(msg.timestamp)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300 break-words">
                    {msg.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-200 mb-2">
            ℹ️ How it works
          </h3>
          <ul className="text-xs text-blue-300 space-y-1">
            <li>• Messages are sent directly to agent tmux sessions</li>
            <li>• All text is sent literally (no command execution risk)</li>
            <li>• Broadcast to team sends to Ana, Bill, Carl, Dan, Enzo</li>
            <li>• Broadcast to all sends to all active agent sessions</li>
            <li>• Quick actions provide common message templates</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
