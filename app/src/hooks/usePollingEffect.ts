import { useEffect, useRef } from 'react';

export interface UsePollingEffectOptions {
  /** Polling interval in milliseconds */
  interval: number;
  /** Condition that must be true for polling to run */
  enabled: boolean;
  /** Function to call on each poll */
  callback: () => void | Promise<void>;
}

/**
 * Hook for conditional polling/auto-refresh.
 *
 * Starts an interval when `enabled` is true, and cleans up when it becomes false
 * or on unmount. Commonly used for auto-refreshing data when agents are running.
 *
 * @example
 * const { data: agents, refresh } = useFetchData({...});
 *
 * usePollingEffect({
 *   interval: 3000,
 *   enabled: agents.some(a => a.is_running),
 *   callback: refresh,
 * });
 */
export function usePollingEffect({
  interval,
  enabled,
  callback,
}: UsePollingEffectOptions): void {
  const callbackRef = useRef(callback);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      // Handle both sync and async callbacks, catching any errors
      try {
        Promise.resolve(callbackRef.current()).catch((err) => {
          console.error('Polling callback error:', err);
        });
      } catch (err) {
        console.error('Polling callback sync error:', err);
      }
    }, interval);

    return () => clearInterval(id);
  }, [enabled, interval]);
}
