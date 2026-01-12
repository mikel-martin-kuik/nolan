import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '@/lib/api';

interface AuthStatus {
  authenticated: boolean;
  authRequired: boolean;
  passwordConfigured: boolean;
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(
    () => typeof window !== 'undefined' ? localStorage.getItem('nolan-session-token') : null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/auth/status`);
      if (!response.ok) {
        throw new Error(`Auth status check failed: ${response.status}`);
      }
      const data = await response.json();

      // Validate response has expected fields
      const authRequired = data.auth_required ?? false;
      const passwordConfigured = data.password_configured ?? false;

      // Validate token by making an authenticated request
      let isAuthenticated = false;
      if (sessionToken) {
        try {
          const testResponse = await fetch(`${getApiBase()}/api/agents`, {
            headers: { 'X-Nolan-Session': sessionToken },
          });
          isAuthenticated = testResponse.ok;
          if (!isAuthenticated) {
            // Token is invalid, clear it
            localStorage.removeItem('nolan-session-token');
            setSessionToken(null);
          }
        } catch {
          isAuthenticated = false;
        }
      }

      setStatus({
        authenticated: isAuthenticated,
        authRequired,
        passwordConfigured,
      });
    } catch (e) {
      console.error('Auth status check error:', e);
      setError('Failed to check auth status');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const login = useCallback(async (password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        setSessionToken(data.session_token);
        localStorage.setItem('nolan-session-token', data.session_token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (sessionToken) {
      await fetch(`${getApiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'X-Nolan-Session': sessionToken },
      });
    }
    setSessionToken(null);
    localStorage.removeItem('nolan-session-token');
  }, [sessionToken]);

  const setupPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiBase()}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // After setup, log in automatically
        return await login(password);
      }
      return false;
    } catch {
      return false;
    }
  }, [login]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return {
    status,
    sessionToken,
    loading,
    error,
    login,
    logout,
    setupPassword,
    checkAuthStatus,
  };
}
