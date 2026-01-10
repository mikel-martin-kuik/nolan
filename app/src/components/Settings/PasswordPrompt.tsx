import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, KeyRound } from 'lucide-react';

interface PasswordPromptProps {
  onSubmit: (password: string) => Promise<boolean>;
  onCancel?: () => void;
  isSetup?: boolean;
}

export function PasswordPrompt({ onSubmit, onCancel, isSetup }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSetup && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (isSetup && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const success = await onSubmit(password);
    setLoading(false);

    if (!success) {
      setError('Invalid password');
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {isSetup ? <KeyRound className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle>
            {isSetup ? 'Set Up Server Password' : 'Authentication Required'}
          </CardTitle>
          <CardDescription>
            {isSetup
              ? 'Create a password to secure your Nolan server'
              : 'Enter the server password to continue'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
            </div>

            {isSetup && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Authenticating...' : (isSetup ? 'Set Password' : 'Login')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
