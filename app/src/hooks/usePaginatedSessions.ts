import { useInfiniteQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { PaginatedSessions } from '../types/sessions';

interface UsePaginatedSessionsOptions {
  project?: string;
  from_date?: string;
  to_date?: string;
  pageSize?: number;
  enabled?: boolean;
}

export function usePaginatedSessions({
  project,
  from_date,
  to_date,
  pageSize = 50,
  enabled = true,
}: UsePaginatedSessionsOptions = {}) {
  const query = useInfiniteQuery({
    queryKey: ['sessions-paginated', project, from_date, to_date, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * pageSize;
      const result = await invoke<PaginatedSessions>('get_sessions_paginated', {
        project,
        fromDate: from_date,
        toDate: to_date,
        limit: pageSize,
        offset,
      });
      return result;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.has_more ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  // Flatten all pages into a single array
  const sessions = query.data?.pages.flatMap(page => page.sessions) ?? [];

  // Get total from first page
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    sessions,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
