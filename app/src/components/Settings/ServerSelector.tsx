import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Server, Globe, Laptop, Check } from 'lucide-react';
import { isBrowserMode } from '@/lib/api';
import { STORAGE_SERVER_URL, DEFAULT_NOLAN_URL } from '@/lib/constants';

interface ServerSelectorProps {
  onConnect: (url: string) => void;
  currentUrl: string;
}

export function ServerSelector({ onConnect, currentUrl }: ServerSelectorProps) {
  const inBrowser = isBrowserMode();
  const storedUrl = localStorage.getItem(STORAGE_SERVER_URL);

  const [selectedOption, setSelectedOption] = useState(() => {
    if (!inBrowser) {
      // In Tauri mode
      return storedUrl ? 'remote' : 'local';
    }
    // In browser mode
    if (!storedUrl || storedUrl === '') return 'sameserver';
    if (storedUrl === DEFAULT_NOLAN_URL) return 'localhost';
    return 'custom';
  });
  const [customUrl, setCustomUrl] = useState(
    selectedOption === 'custom' || selectedOption === 'remote' ? currentUrl : ''
  );

  const handleSelect = (value: string) => {
    setSelectedOption(value);

    if (value === 'local') {
      // Tauri mode: use embedded backend
      localStorage.removeItem(STORAGE_SERVER_URL);
      window.location.reload();
    } else if (value === 'sameserver') {
      // Browser mode: use same origin (nginx proxy)
      localStorage.setItem(STORAGE_SERVER_URL, '');
      onConnect('');
    } else if (value === 'localhost') {
      // Browser mode: use localhost (for local development)
      localStorage.setItem(STORAGE_SERVER_URL, DEFAULT_NOLAN_URL);
      onConnect(DEFAULT_NOLAN_URL);
    }
  };

  const handleCustomSubmit = () => {
    if (customUrl) {
      localStorage.setItem(STORAGE_SERVER_URL, customUrl);
      onConnect(customUrl);
    }
  };

  // Tauri desktop app
  if (!inBrowser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Server className="h-5 w-5" />
            Server Connection
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Choose between the embedded backend or a remote server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={selectedOption} onValueChange={handleSelect}>
            <div className="flex items-start sm:items-center space-x-3 p-3 sm:p-3 rounded-lg border hover:bg-accent/50 cursor-pointer min-h-[60px]">
              <RadioGroupItem value="local" id="local" className="mt-1 sm:mt-0" />
              <label htmlFor="local" className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 cursor-pointer">
                <Laptop className="h-5 w-5 text-muted-foreground hidden sm:block" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm sm:text-base">Embedded Backend</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Use the built-in Nolan server (default)
                  </div>
                </div>
                {!storedUrl && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
              </label>
            </div>

            <div className="flex items-start sm:items-center space-x-3 p-3 sm:p-3 rounded-lg border hover:bg-accent/50 cursor-pointer min-h-[60px]">
              <RadioGroupItem value="remote" id="remote" className="mt-1 sm:mt-0" />
              <label htmlFor="remote" className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 cursor-pointer">
                <Globe className="h-5 w-5 text-muted-foreground hidden sm:block" />
                <div className="min-w-0">
                  <div className="font-medium text-sm sm:text-base">Remote Server</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Connect to a Nolan server on the network
                  </div>
                </div>
              </label>
            </div>
          </RadioGroup>

          {selectedOption === 'remote' && (
            <div className="space-y-3 pl-0 sm:pl-7">
              <Input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="http://192.168.1.100:3030"
              />
              <Button onClick={handleCustomSubmit} className="w-full">
                Connect
              </Button>
            </div>
          )}

          {storedUrl && (
            <div className="text-xs sm:text-sm text-muted-foreground border-t pt-4 break-words">
              Currently connected to: <code className="bg-muted px-1.5 py-0.5 rounded break-all">{storedUrl}</code>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Browser mode - just show connection status, always use same-origin
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Server className="h-5 w-5" />
          Server Connection
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Connected to the Nolan server hosting this page
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-accent/30">
          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm sm:text-base">Connected</div>
            <div className="text-xs sm:text-sm text-muted-foreground break-all">
              Using server at {window.location.origin}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
