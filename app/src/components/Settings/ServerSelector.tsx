import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Server, Globe, Laptop, Check } from 'lucide-react';
import { isBrowserMode } from '@/lib/api';

interface ServerSelectorProps {
  onConnect: (url: string) => void;
  currentUrl: string;
}

export function ServerSelector({ onConnect, currentUrl }: ServerSelectorProps) {
  const inBrowser = isBrowserMode();
  const storedUrl = localStorage.getItem('nolan-server-url');

  const [selectedOption, setSelectedOption] = useState(() => {
    if (!inBrowser) {
      // In Tauri mode
      return storedUrl ? 'remote' : 'local';
    }
    // In browser mode
    if (!storedUrl || currentUrl === 'http://localhost:3030') return 'localhost';
    return 'custom';
  });
  const [customUrl, setCustomUrl] = useState(
    selectedOption === 'custom' || selectedOption === 'remote' ? currentUrl : ''
  );

  const handleSelect = (value: string) => {
    setSelectedOption(value);

    if (value === 'local') {
      // Tauri mode: use embedded backend
      localStorage.removeItem('nolan-server-url');
      window.location.reload();
    } else if (value === 'localhost') {
      // Browser mode: use localhost
      localStorage.setItem('nolan-server-url', 'http://localhost:3030');
      onConnect('http://localhost:3030');
    }
  };

  const handleCustomSubmit = () => {
    if (customUrl) {
      localStorage.setItem('nolan-server-url', customUrl);
      onConnect(customUrl);
    }
  };

  // Tauri desktop app
  if (!inBrowser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server Connection
          </CardTitle>
          <CardDescription>
            Choose between the embedded backend or a remote server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={selectedOption} onValueChange={handleSelect}>
            <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="local" id="local" />
              <label htmlFor="local" className="flex items-center gap-3 flex-1 cursor-pointer">
                <Laptop className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Embedded Backend</div>
                  <div className="text-sm text-muted-foreground">
                    Use the built-in Nolan server (default)
                  </div>
                </div>
                {!storedUrl && <Check className="h-4 w-4 text-green-500" />}
              </label>
            </div>

            <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="remote" id="remote" />
              <label htmlFor="remote" className="flex items-center gap-3 flex-1 cursor-pointer">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">Remote Server</div>
                  <div className="text-sm text-muted-foreground">
                    Connect to a Nolan server on the network
                  </div>
                </div>
              </label>
            </div>
          </RadioGroup>

          {selectedOption === 'remote' && (
            <div className="space-y-3 pl-7">
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
            <div className="text-sm text-muted-foreground border-t pt-4">
              Currently connected to: <code className="bg-muted px-1.5 py-0.5 rounded">{storedUrl}</code>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Browser mode
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Server Connection
        </CardTitle>
        <CardDescription>
          Select which Nolan server to connect to
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={selectedOption} onValueChange={handleSelect}>
          <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="localhost" id="localhost" />
            <label htmlFor="localhost" className="flex items-center gap-3 flex-1 cursor-pointer">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">Localhost</div>
                <div className="text-sm text-muted-foreground">
                  Connect to http://localhost:3030
                </div>
              </div>
              {currentUrl === 'http://localhost:3030' && <Check className="h-4 w-4 text-green-500" />}
            </label>
          </div>

          <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="custom" id="custom" />
            <label htmlFor="custom" className="flex items-center gap-3 flex-1 cursor-pointer">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Custom Server</div>
                <div className="text-sm text-muted-foreground">
                  Connect to a remote Nolan server
                </div>
              </div>
            </label>
          </div>
        </RadioGroup>

        {selectedOption === 'custom' && (
          <div className="space-y-3 pl-7">
            <Input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://your-server.com:3030"
            />
            <Button onClick={handleCustomSubmit} className="w-full">
              Connect
            </Button>
          </div>
        )}

        {storedUrl && storedUrl !== 'http://localhost:3030' && (
          <div className="text-sm text-muted-foreground border-t pt-4">
            Currently connected to: <code className="bg-muted px-1.5 py-0.5 rounded">{currentUrl}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
