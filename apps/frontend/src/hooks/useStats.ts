'use client';

import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import type { Stats } from '@/types/api';

/**
 * M4.Q1 — Stats query hook.
 *
 * Fetches GET /api/stats only when:
 *  - The session is ready (sessionReady === true)
 *  - The consumer signals the query is enabled (e.g. dialog is open)
 *
 * staleTime: 30 000ms — reopening the dialog within 30s shows cached data
 * without a spinner (spec scenario 8.4).
 */
export function useStats(dialogOpen: boolean): {
  data: Stats | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const sessionReady = useSessionStore((s) => s.sessionReady);

  const { data, isLoading, isError, refetch } = useQuery<Stats>({
    queryKey: queryKeys.stats,
    queryFn: getStats,
    enabled: sessionReady && dialogOpen,
    staleTime: 30_000,
  });

  return { data, isLoading, isError, refetch };
}
