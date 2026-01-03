import React from 'react';
import { Button } from '../shared/Button';

interface QuickActionsProps {
  onQuickMessage: (message: string) => void;
}

interface QuickAction {
  label: string;
  message: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Request Status',
    message: 'What is your current status? What are you working on?',
    variant: 'secondary',
  },
  {
    label: 'Ask for Update',
    message: 'Can you provide an update on your progress?',
    variant: 'secondary',
  },
  {
    label: 'Pause Work',
    message: 'Please pause your current work and wait for further instructions.',
    variant: 'secondary',
  },
  {
    label: 'Resume Work',
    message: 'You can resume your work now.',
    variant: 'primary',
  },
  {
    label: 'Review Required',
    message: 'Please review the latest changes and provide feedback.',
    variant: 'secondary',
  },
  {
    label: 'Help Needed',
    message: 'I need your assistance. Please respond when available.',
    variant: 'primary',
  },
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onQuickMessage }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Quick Actions</h3>

      <p className="text-sm text-gray-400">
        Click a preset message to quickly send common requests:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((action, index) => (
          <Button
            key={index}
            onClick={() => onQuickMessage(action.message)}
            variant={action.variant || 'secondary'}
            size="sm"
            className="w-full text-left justify-start"
          >
            {action.label}
          </Button>
        ))}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
        <h4 className="text-sm font-medium text-gray-300 mb-2">💡 Tips</h4>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Quick actions will populate the message field</li>
          <li>• You can edit the message before sending</li>
          <li>• Use Ctrl+Enter to send quickly</li>
          <li>• Messages are sent as literal text (safe)</li>
        </ul>
      </div>
    </div>
  );
};
