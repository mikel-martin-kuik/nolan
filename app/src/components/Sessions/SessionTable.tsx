import { List, type RowComponentProps } from 'react-window';
import { Session } from '@/types/sessions';

const VIRTUALIZATION_THRESHOLD = 100;

interface SessionRowData {
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

interface SessionRowProps {
  session: Session;
  onClick: (session: Session) => void;
  style?: React.CSSProperties;
}

function SessionRow({ session, onClick, style }: SessionRowProps) {
  return (
    <div
      style={style}
      className="glass-card rounded-xl mb-2 p-4 cursor-pointer transition-all duration-200"
      onClick={() => onClick(session)}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-medium text-sm text-foreground">{session.summary}</h3>
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(session.first_timestamp).toLocaleString()}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{session.message_count} messages</div>
          <div className="font-mono text-primary">${session.token_usage.total_cost.toFixed(4)}</div>
        </div>
      </div>
      {session.agents.length > 0 && (
        <div className="mt-2 flex gap-2">
          {session.agents.map((agent) => (
            <span
              key={agent}
              className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-lg"
            >
              {agent}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const VirtualizedRow = ({ index, style, sessions, onSessionClick }: RowComponentProps<SessionRowData>) => {
  const session = sessions[index];
  return (
    <SessionRow
      session={session}
      onClick={onSessionClick}
      style={style}
    />
  );
};

interface RegularListProps {
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

function RegularList({ sessions, onSessionClick }: RegularListProps) {
  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <SessionRow
          key={session.session_id}
          session={session}
          onClick={onSessionClick}
        />
      ))}
    </div>
  );
}

interface SessionTableProps {
  sessions: Session[];
  onSessionClick: (session: Session) => void;
}

export function SessionTable({ sessions, onSessionClick }: SessionTableProps) {
  // Use regular list for small datasets
  if (sessions.length <= VIRTUALIZATION_THRESHOLD) {
    return <RegularList sessions={sessions} onSessionClick={onSessionClick} />;
  }

  // Virtualize for large datasets
  return (
    <div style={{ height: '600px', width: '100%' }}>
      <List
        defaultHeight={600}
        rowComponent={VirtualizedRow}
        rowCount={sessions.length}
        rowHeight={80}
        rowProps={{ sessions, onSessionClick }}
      />
    </div>
  );
}
