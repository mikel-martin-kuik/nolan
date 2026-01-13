import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ShieldCheck, ShieldOff, LogOut } from 'lucide-react';
import { isBrowserMode } from '@/lib/api';

interface AuthStatusProps {
  authenticated: boolean;
  authRequired: boolean;
  onLogout: () => void;
}

export function AuthStatus({ authenticated, authRequired, onLogout }: AuthStatusProps) {
  // In Tauri mode, auth isn't relevant
  if (!isBrowserMode()) {
    return null;
  }

  const handleLogout = () => {
    onLogout();
    window.location.reload();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Shield className="h-5 w-5" />
          Authentication
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Server authentication status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg border min-h-[60px]">
          {authenticated ? (
            <>
              <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm sm:text-base">Authenticated</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  You are logged in to the server
                </div>
              </div>
            </>
          ) : authRequired ? (
            <>
              <ShieldOff className="h-5 w-5 text-yellow-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm sm:text-base">Not Authenticated</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Server requires authentication
                </div>
              </div>
            </>
          ) : (
            <>
              <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm sm:text-base">No Authentication</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Server does not require authentication
                </div>
              </div>
            </>
          )}
        </div>

        {authenticated && (
          <Button variant="outline" onClick={handleLogout} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
