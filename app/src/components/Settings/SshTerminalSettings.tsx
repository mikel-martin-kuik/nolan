import React, { useState, useEffect } from 'react';
import { useTerminalStore } from '@/store/terminalStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Terminal, Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { invoke } from '@/lib/api';

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'disconnected';

export const SshTerminalSettings: React.FC = () => {
  const { sshBaseUrl, sshEnabled, setSshConfig } = useTerminalStore();
  const [baseUrl, setBaseUrl] = useState(sshBaseUrl || 'http://localhost:7681');
  const [enabled, setEnabled] = useState(sshEnabled);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setBaseUrl(sshBaseUrl || 'http://localhost:7681');
    setEnabled(sshEnabled);
  }, [sshBaseUrl, sshEnabled]);

  // Track changes
  useEffect(() => {
    const urlChanged = baseUrl !== (sshBaseUrl || 'http://localhost:7681');
    const enabledChanged = enabled !== sshEnabled;
    setHasChanges(urlChanged || enabledChanged);
  }, [baseUrl, enabled, sshBaseUrl, sshEnabled]);

  const checkConnection = async () => {
    setStatus('checking');
    try {
      // Try to fetch the terminal URL to check if ttyd is running
      await fetch(baseUrl, {
        method: 'GET',
        mode: 'no-cors', // ttyd might not have CORS configured
      });
      // With no-cors, we can't check the response, but if fetch succeeds it likely exists
      setStatus('connected');
    } catch {
      // Fetch failed - server not reachable
      setStatus('disconnected');
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await invoke('update_ssh_terminal_config', {
        base_url: baseUrl,
        enabled,
      });
      // Update the store
      setSshConfig(baseUrl, enabled);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save SSH terminal config:', error);
    } finally {
      setSaving(false);
    }
  };

  const openTerminal = () => {
    // Open terminal without session (shows available sessions)
    window.open(baseUrl, '_blank', 'noopener,noreferrer');
  };

  const StatusIcon = () => {
    switch (status) {
      case 'checking':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking connection...';
      case 'connected':
        return 'Terminal server available';
      case 'disconnected':
        return 'Terminal server not reachable';
      default:
        return enabled ? 'Click test to verify connection' : 'Terminal disabled';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Terminal className="h-5 w-5" />
          Web Terminal (ttyd)
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Browser-based terminal access to agent tmux sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">Enable Web Terminal</span>
            <p className="text-xs text-muted-foreground">
              Allow opening terminals in browser tabs
            </p>
          </div>
          <Switch
            id="ssh-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Status */}
        {enabled && (
          <div className="flex items-center gap-2">
            <StatusIcon />
            <span className="text-sm">{statusText()}</span>
          </div>
        )}

        {/* URL Configuration */}
        {enabled && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Terminal Server URL</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:7681"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={checkConnection}
                disabled={status === 'checking'}
                title="Test connection"
                className="w-full sm:w-auto"
              >
                <RefreshCw className={`h-4 w-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
                <span className="ml-2 sm:hidden">Test</span>
              </Button>
            </div>
          </div>
        )}

        {/* Save Button */}
        {hasChanges && (
          <Button
            onClick={saveConfig}
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        )}

        {/* Open Terminal Button */}
        {enabled && status === 'connected' && (
          <Button
            variant="outline"
            onClick={openTerminal}
            className="w-full"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Terminal
          </Button>
        )}

        {/* Help text when disconnected */}
        {enabled && status === 'disconnected' && (
          <div className="text-sm text-muted-foreground border-t pt-4 space-y-2">
            <p>The web terminal server (ttyd) is not running.</p>
            <p className="font-medium">To set up ttyd locally:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Install: <code className="bg-muted px-1.5 py-0.5 rounded">sudo apt install ttyd</code></li>
              <li>Create attach script (see setup.sh for template)</li>
              <li>Run: <code className="bg-muted px-1.5 py-0.5 rounded">ttyd -p 7681 -W -a ./ttyd-attach.sh</code></li>
            </ol>
            <p className="text-xs mt-2">
              Docker deployments include ttyd automatically.
            </p>
          </div>
        )}

        {/* Disabled state help */}
        {!enabled && (
          <div className="text-sm text-muted-foreground border-t pt-4">
            <p>
              Enable web terminal to access agent tmux sessions directly in your browser.
              This replaces the need for native terminal emulators in browser-based deployments.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
