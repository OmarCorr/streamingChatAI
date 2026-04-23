'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getConversation, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import type { ConversationWithMessages } from '@/types/api';

/**
 * M2.G2 — Fetches a single conversation with its messages.
 * Gated on sessionReady && !!id.
 * On 404 (deleted or foreign session), navigates to /c/new — spec scenario 10.3.
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
