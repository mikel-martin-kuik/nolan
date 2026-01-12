import { useState, useCallback, useEffect, useRef } from 'react';
import { useToastStore } from '../store/toastStore';

export interface UseFetchDataOptions<T> {
  /** Function to fetch data */
  fetcher: () => Promise<T>;
  /** Default value before first fetch */
  defaultValue: T;
  /** Whether to fetch immediately on mount */
  immediate?: boolean;
  /** Error message prefix for toast */
  errorMessage?: string;
  /** Initialization function to run before first fetch */
  init?: () => Promise<void>;
}

export interface UseFetchDataResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

/**
 * Hook for fetching data with loading state and error handling.
 *
 * Combines the common pattern of:
 * - useState for data + loading
 * - useCallback for the fetch function
 * - useEffect for initial fetch
 * - Toast error handling
 *
 * @example
 * const { data: agents, loading, refresh } = useFetchData({
 *   fetcher: () => invoke<Agent[]>('list_agents'),
 *   defaultValue: [],
 *   errorMessage: 'Failed to load agents',
 * });
 */
export function useFetchData<T>({
  fetcher,
  defaultValue,
  immediate = true,
  errorMessage = 'Failed to load data',
  init,
}: UseFetchDataOptions<T>): UseFetchDataResult<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { error: showError } = useToastStore();

  // Use refs to avoid recreating refresh callback when inline functions change
  const fetcherRef = useRef(fetcher);
  const initRef = useRef(init);
  const errorMessageRef = useRef(errorMessage);
  const defaultValueRef = useRef(defaultValue);

  // Keep refs updated with latest values
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);
  useEffect(() => { initRef.current = init; }, [init]);
  useEffect(() => { errorMessageRef.current = errorMessage; }, [errorMessage]);
  useEffect(() => { defaultValueRef.current = defaultValue; }, [defaultValue]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      showError(`${errorMessageRef.current}: ${e.message}`);
      setData(defaultValueRef.current);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!immediate) return;

    let cancelled = false;

    const load = async () => {
      const initFn = initRef.current;
      if (initFn) {
        try {
          await initFn();
        } catch {
          // Init may fail if already initialized - continue anyway
        }
      }
      if (!cancelled) {
        await refresh();
      }
    };

    load().catch((err) => {
      // Only log if not cancelled (component still mounted)
      if (!cancelled) {
        console.error('Failed to load data:', err);
      }
    });

    return () => { cancelled = true; };
  }, [immediate, refresh]);

  return { data, loading, error, refresh, setData };
}
