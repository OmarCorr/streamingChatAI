'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sseStream } from '@/lib/sse';
import { useStreamStore } from '@/stores/stream';
import { queryKeys } from '@/lib/queryKeys';
import type { ConversationWithMessages } from '@/types/api';

/**
 * M3.N1 — Regenerate hook.
 *
 * Behaviour:
 * - Guards: if streamStore.status !== 'idle', no-op (spec scenario 4.3).
 * - Optimistically slices the TanStack cache at targetIndex before streaming.
 * - Calls POST /api/conversations/:id/messages/:mid/regenerate via sseStream.
 * - Same SSE event pipeline as useStream (start → token → metadata → done/error).
 * - On 404: shows Sonner toast, reverts the optimistic slice.
 * - On terminal events: invalidates ['conversation', id] + ['conversations'].
 */

interface UseRegenerateReturn {
  regenerate: (
    conversationId: string,
    messageId: string,
    targetIndex: number,
  ) => Promise<void>;
}

export function useRegenerate(): UseRegenerateReturn {
  const queryClient = useQueryClient();
  const store = useStreamStore;

  const regenerate = useCallback(
    async (
      conversationId: string,
      messageId: string,
      targetIndex: number,
    ): Promise<void> => {
      // Guard: block if another stream is active (spec scenario 4.3).
      if (store.getState().status !== 'idle') return;

      // Snapshot current messages for rollback.
      const snapshot = queryClient.getQueryData<ConversationWithMessages>(
        queryKeys.conversation(conversationId),
      );

      // Optimistic slice: remove target and all subsequent messages.
      queryClient.setQueryData<ConversationWithMessages>(
        queryKeys.conversation(conversationId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.slice(0, targetIndex),
          };
        },
      );

      // Start stream state.
      store.getState().start(conversationId);
      const signal = store.getState().abort!.signal;

      try {
        const stream = sseStream(
          `/api/conversations/${conversationId}/messages/${messageId}/regenerate`,
          {},
          signal,
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'start':
              store.getState().setActiveStreamId(event.data.messageId);
              break;

            case 'token':
              store.getState().appendToken(event.data.delta);
              break;

            case 'metadata':
              store.getState().setMetadata(event.data);
              break;

            case 'done':
              store.getState().finalize('complete');
              await queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
              await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
              break;

            case 'error':
              store.getState().setError(event.data.message);
              store.getState().finalize('error');
              await queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
              break;
          }
        }
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';

        if (isAbort) {
          store.getState().finalize('cancelled');
          await queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
          return;
        }

        const statusCode =
          err instanceof Error && 'statusCode' in err
            ? (err as Error & { statusCode: number }).statusCode
            : 0;

        if (statusCode === 404) {
          // Stale targetIndex — revert the optimistic slice.
          toast.error('Could not regenerate this message.', {
            description: 'The conversation may have changed. Please refresh.',
          });
          if (snapshot) {
            queryClient.setQueryData(queryKeys.conversation(conversationId), snapshot);
          }
          store.getState().finalize('complete');
          return;
        }

        // Generic error.
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        toast.error('Regeneration failed.', { description: message });

        // Revert the optimistic slice on generic error too.
        if (snapshot) {
          queryClient.setQueryData(queryKeys.conversation(conversationId), snapshot);
        }
        store.getState().finalize('complete');
      }
    },
    [queryClient],
  );

  return { regenerate };
}
