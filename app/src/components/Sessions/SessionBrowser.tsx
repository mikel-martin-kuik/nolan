import { useState } from 'react';
import { useSessions } from '@/hooks/useSessions';
import { SessionTable } from './SessionTable';
import { SessionDetail } from './SessionDetail';
import { Session } from '@/types/sessions';

export function SessionBrowser() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data: sessions, isLoading, error } = useSessions();

  const handleSessionClick = (session: Session) => {
    setSelectedSessionId(session.session_id);
  };

  const handleCloseDetail = () => {
    setSelectedSessionId(null);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Claude Code Sessions</h1>
        <p className="text-gray-400 mt-2">
          Browse and export your Claude Code conversation history
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-8">
          <div className="text-gray-500">Loading sessions...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          <p className="font-bold">Error loading sessions</p>
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      {sessions && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b dark:border-gray-700">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {sessions.length} sessions found
              </div>
              <div className="text-sm font-mono text-gray-600 dark:text-gray-400">
                Total cost: $
                {sessions.reduce((sum, s) => sum + s.token_usage.total_cost, 0).toFixed(4)}
              </div>
            </div>
          </div>
          <SessionTable sessions={sessions} onSessionClick={handleSessionClick} />
        </div>
      )}

      {selectedSessionId && (
        <SessionDetail sessionId={selectedSessionId} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
