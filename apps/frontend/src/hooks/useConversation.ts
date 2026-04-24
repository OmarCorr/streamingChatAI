'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getConversation, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import type { ConversationWithMessages } from '@/types/api';

/**
 * Fetches a single conversation with its messages.
 *
 * Gated on `sessionReady && !!id` via TanStack Query's `enabled` flag — we
 * must not fetch before the session cookie is established, otherwise the
 * backend creates a fresh session and this conversation will always 404.
 *
 * On 404, navigates to `/c/new`. Two scenarios produce a 404:
 * 1. The conversation was deleted (our own session).
 * 2. The conversation exists but belongs to another session (see
 *    `ConversationOwnerGuard` — 404 is returned deliberately to prevent
 *    id enumeration across sessions).
 *
 * We can't distinguish the two, but the UX response is the same: bounce
 * the user to a fresh "new conversation" screen.
 */
export function useConversation(id: string): {
  data: ConversationWithMessages | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const sessionReady = useSessionStore((s) => s.sessionReady);
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.conversation(id),
    queryFn: async () => {
      try {
        return await getConversation(id);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          router.replace('/c/new');
          return undefined;
        }
        throw err;
      }
    },
    enabled: sessionReady && !!id,
  });

  return {
    data,
    isLoading,
    error: error as Error | null,
  };
}
