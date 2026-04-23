'use client';

import { useQuery } from '@tanstack/react-query';
import { getConversations } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import type { Conversation } from '@/types/api';

/**
 * M2.G1 — Fetches all conversations for the current session.
 * Gated on sessionReady to prevent firing before the cookie is established.
 * Sorted by updatedAt DESC on the server side (backend contract).
 */
export function useConversations(): {
  conversations: Conversation[];
  isLoading: boolean;
  error: Error | null;
} {
  const sessionReady = useSessionStore((s) => s.sessionReady);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: getConversations,
    enabled: sessionReady,
  });

  return {
    conversations: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
