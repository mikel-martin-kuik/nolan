import React, { useEffect, useState } from 'react';
import { useProviderStore } from '@/store/providerStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Terminal, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export const ProviderSettings: React.FC = () => {
  const {
    status,
    providers,
    defaultProvider,
    fetchProviders,
    setDefaultProvider,
  } = useProviderStore();

  const [pendingDefault, setPendingDefault] = useState<string | null>(null);

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const isLoading = status === 'loading';

  const handleSetDefault = async (providerName: string) => {
    if (providerName === defaultProvider) return;

    setPendingDefault(providerName);
    try {
      await setDefaultProvider(providerName);
    } finally {
      setPendingDefault(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Terminal className="h-5 w-5" />
          CLI Providers
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Available CLI providers for running AI agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status header with refresh button */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Default: <code className="bg-muted px-1.5 py-0.5 rounded">{defaultProvider}</code>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProviders}
            disabled={isLoading}
            title="Refresh provider status"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="ml-2 sm:hidden">Refresh</span>
          </Button>
        </div>

        {/* Provider list */}
        <div className="space-y-3">
          {isLoading && providers.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking providers...
            </div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.name}
                className={`flex items-start gap-3 p-3 rounded-lg border bg-card ${
                  provider.name === defaultProvider ? 'border-primary/50' : ''
                }`}
              >
                {/* Status icon */}
                <div className="mt-0.5">
                  {provider.available ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>

                {/* Provider info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    {provider.name === defaultProvider && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {provider.description}
                  </p>
                  <p className="text-xs mt-1">
                    {provider.available ? (
                      <span className="text-green-600 dark:text-green-400">Installed and available</span>
                    ) : (
                      <span className="text-muted-foreground">Not installed</span>
                    )}
                  </p>
                </div>

                {/* Set as default button */}
                <div className="flex-shrink-0">
                  {provider.name !== defaultProvider && provider.available && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(provider.name)}
                      disabled={isLoading || pendingDefault !== null}
                    >
                      {pendingDefault === provider.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Set as default'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Help text */}
        <div className="text-sm text-muted-foreground border-t pt-4 space-y-2">
          <p>
            The default provider is used for all agents unless overridden per-agent using the{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded">cli_provider</code> field.
          </p>
          <p className="text-xs">
            If a configured provider is unavailable, the system will fall back to the default provider.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
