import { useEffect, useRef, useCallback } from 'react';

export interface UseDebouncedCallbackOptions {
  /** Delay in milliseconds before calling the callback */
  delay: number;
  /** The value that triggers the debounced callback when changed */
  value: string;
  /** Condition that must be true for the callback to fire */
  enabled?: boolean;
  /** Minimum value length before triggering */
  minLength?: number;
}

/**
 * Hook for debounced async operations.
 *
 * Executes a callback after a delay when the value changes, with proper
 * cleanup to prevent stale closures and memory leaks.
 *
 * @example
 * const [query, setQuery] = useState('');
 *
 * useDebouncedCallback({
 *   delay: 800,
 *   value: query,
 *   enabled: isConnected,
 *   minLength: 10,
 * }, async (currentValue) => {
 *   const suggestions = await fetchSuggestions(currentValue);
 *   setSuggestions(suggestions);
 * });
 */
export function useDebouncedCallback(
  options: UseDebouncedCallbackOptions,
  callback: (value: string) => void | Promise<void>,
): void {
  const { delay, value, enabled = true, minLength = 0 } = options;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Don't trigger if conditions not met
    if (!enabled || !value.trim() || value.length < minLength) {
      return;
    }

    // Schedule new callback
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [delay, value, enabled, minLength]);
}

/**
 * Hook that returns a debounced version of a callback function.
 *
 * The returned function will only execute after the specified delay
 * has passed without any new calls.
 *
 * @example
 * const debouncedSearch = useDebouncedFn(
 *   async (query: string) => {
 *     const results = await search(query);
 *     setResults(results);
 *   },
 *   300
 * );
 *
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 */
export function useDebouncedFn<T extends (...args: unknown[]) => void | Promise<void>>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay],
  );
}
