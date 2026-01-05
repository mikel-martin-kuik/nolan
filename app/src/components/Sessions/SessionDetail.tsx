import { useSessionDetail } from '@/hooks/useSessions';
import { MessageRenderer } from './MessageRenderer';
import { MessageContent } from '@/types/sessions';

interface SessionDetailProps {
  sessionId: string | null;
  onClose: () => void;
}

function MessageCard({ message }: { message: MessageContent }) {
  const typeColors = {
    user: 'border-blue-500',
    assistant: 'border-purple-500',
    tool_use: 'border-green-500',
    tool_result: 'border-green-300',
    system: 'border-gray-500',
  };

  const typeLabels = {
    user: 'User',
    assistant: 'Assistant',
    tool_use: 'Tool Use',
    tool_result: 'Tool Result',
    system: 'System',
  };

  return (
    <div className={`border-l-4 ${typeColors[message.type]} p-4 mb-4 glass-card rounded-xl`}>
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-sm">
          {typeLabels[message.type]}
          {message.tool_name && <span className="text-muted-foreground ml-2">({message.tool_name})</span>}
        </div>
        {message.timestamp && (
          <div className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleString()}
          </div>
        )}
      </div>
      <MessageRenderer content={message.content} />
      {message.tokens && (
        <div className="mt-2 text-xs text-muted-foreground font-mono">
          Tokens: {message.tokens.input_tokens + message.tokens.output_tokens}
          (${message.tokens.total_cost.toFixed(4)})
        </div>
      )}
    </div>
  );
}

export function SessionDetail({ sessionId, onClose }: SessionDetailProps) {
  const { data: detail, isLoading, error } = useSessionDetail(sessionId);

  if (!sessionId) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="glass-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {isLoading && <div>Loading...</div>}
              {error && <div className="text-red-500">Error loading session</div>}
              {detail && (
                <>
                  <h2 className="text-xl font-bold">{detail.session.summary}</h2>
                  <div className="text-sm text-muted-foreground mt-2">
                    {new Date(detail.session.first_timestamp).toLocaleString()} -
                    {new Date(detail.session.last_timestamp).toLocaleString()}
                  </div>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span>{detail.session.message_count} messages</span>
                    <span className="font-mono">
                      ${detail.session.token_usage.total_cost.toFixed(4)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 px-4 py-2 bg-secondary hover:bg-accent rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {detail?.messages.map((message, index) => (
            <MessageCard key={index} message={message} />
          ))}
        </div>
      </div>
    </div>
  );
}
