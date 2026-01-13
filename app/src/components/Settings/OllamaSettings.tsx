import React, { useEffect } from 'react';
import { useOllamaStore } from '@/store/ollamaStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export const OllamaSettings: React.FC = () => {
  const {
    status,
    version,
    models,
    selectedModel,
    ollamaUrl,
    loading,
    checkConnection,
    setModel,
    setUrl,
  } = useOllamaStore();

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const StatusIcon = () => {
    switch (status) {
      case 'checking':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking connection...';
      case 'connected':
        return version ? `Connected (v${version})` : 'Connected';
      case 'disconnected':
        return 'Not available';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Sparkles className="h-5 w-5" />
          Local AI (Ollama)
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Enable AI-powered features like auto-generating agent descriptions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusIcon />
          <span className="text-sm">{statusText()}</span>
        </div>

        {/* URL Configuration */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Server URL</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={ollamaUrl}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={checkConnection}
              disabled={loading}
              title="Test connection"
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-2 sm:hidden">Test Connection</span>
            </Button>
          </div>
        </div>

        {/* Model Selection */}
        {status === 'connected' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Select value={selectedModel} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {models.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Run <code className="bg-muted px-1.5 py-0.5 rounded">ollama pull qwen2.5:1.5b</code> to download a model
              </p>
            )}
          </div>
        )}

        {/* Help text when disconnected */}
        {status === 'disconnected' && (
          <div className="text-sm text-muted-foreground border-t pt-4 space-y-2">
            <p>Ollama enables local AI features like auto-generating agent descriptions.</p>
            <p>
              Install from{' '}
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ollama.com
              </a>{' '}
              and run <code className="bg-muted px-1.5 py-0.5 rounded">ollama serve</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
