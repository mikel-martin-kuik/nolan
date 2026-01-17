import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { formatErrorMessage } from '@/lib/utils';

interface RecoveryResult {
  recovered: string[];
  failed: string[];
  summary: string;
}

export function SessionRecoveryPanel() {
  const [orphanedSessions, setOrphanedSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [lastRecoveryResult, setLastRecoveryResult] = useState<RecoveryResult | null>(null);
  const { success, error: showError } = useToastStore();

  const fetchOrphanedSessions = useCallback(async () => {
    setLoading(true);
    try {
      const sessions = await invoke<string[]>('list_orphaned_sessions');
      setOrphanedSessions(sessions);
    } catch (err) {
      const message = formatErrorMessage(err);
      showError(`Failed to list orphaned sessions: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const recoverSessions = async () => {
    setRecovering(true);
    setLastRecoveryResult(null);
    try {
      const result = await invoke<RecoveryResult>('recover_sessions');
      setLastRecoveryResult(result);
      if (result.recovered.length > 0) {
        success(`Recovered ${result.recovered.length} session(s)`);
      }
      // Refresh the list after recovery
      await fetchOrphanedSessions();
    } catch (err) {
      const message = formatErrorMessage(err);
      showError(`Failed to recover sessions: ${message}`);
    } finally {
      setRecovering(false);
    }
  };

  useEffect(() => {
    fetchOrphanedSessions();
  }, [fetchOrphanedSessions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <RotateCcw className="h-5 w-5" />
          Session Recovery
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Recover orphaned Claude Code sessions after crashes or unexpected shutdowns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrphanedSessions}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {orphanedSessions.length > 0 && (
            <Button
              size="sm"
              onClick={recoverSessions}
              disabled={recovering}
            >
              {recovering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Recover All
            </Button>
          )}
        </div>

        {/* Orphaned Sessions List */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Scanning for orphaned sessions...</span>
          </div>
        ) : orphanedSessions.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm">No orphaned sessions found</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span>{orphanedSessions.length} orphaned session(s) found</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {orphanedSessions.map((session) => (
                <Badge key={session} variant="secondary" className="text-xs">
                  {session}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Last Recovery Result */}
        {lastRecoveryResult && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Last Recovery Result</p>
            <p className="text-xs text-muted-foreground">{lastRecoveryResult.summary}</p>
            {lastRecoveryResult.recovered.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lastRecoveryResult.recovered.map((s) => (
                  <Badge key={s} variant="default" className="text-xs bg-green-500/10 text-green-600">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {lastRecoveryResult.failed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lastRecoveryResult.failed.map((s) => (
                  <Badge key={s} variant="destructive" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
