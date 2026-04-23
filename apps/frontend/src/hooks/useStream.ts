'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sseStream } from '@/lib/sse';
import { useStreamStore } from '@/stores/stream';
import { queryKeys } from '@/lib/queryKeys';
import type { ConversationWithMessages, Message } from '@/types/api';

/**
 * M3.M1 — Chat streaming hook.
 *
 * Responsibilities:
 * - Optimistically inserts a user bubble into the TanStack Query cache (client UUID).
 * - Opens the SSE stream via lib/sse.ts + AbortController.
 * - Routes SSE events to streamStore actions.
 * - On `done`/`error`/`cancelled`: invalidates ['conversation', id] and ['conversations']
 *   so TanStack Query syncs server-authoritative state (R10: reconciliation).
 * - 429: Sonner toast + remove optimistic bubble + reset stream state.
 * - Cancel: calls streamStore.cancel() which fires abort.abort() internally.
 *
 * R10 — Optimistic reconciliation:
 *   The optimistic user message uses a temporary client UUID. On `done`, TanStack Query
 *   invalidates and refetches the conversation. The refetch response contains the
 *   server-persisted user message with its real ID, replacing the optimistic entry.
 *   Deduplication happens naturally: the cache is fully replaced with server data on refetch.
 */

const CLIENT_UUID_PREFIX = 'optimistic-';

function generateClientId(): string {
  return `${CLIENT_UUID_PREFIX}${Math.random().toString(36).slice(2)}`;
}

interface UseStreamReturn {
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  cancel: () => void;
}

export function useStream(): UseStreamReturn {
  const queryClient = useQueryClient();
  const store = useStreamStore;

  const sendMessage = useCallback(
    async (conversationId: string, content: string): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed) return;

      // Start stream state — creates a new AbortController internally.
      store.getState().start(conversationId);
      const signal = store.getState().abort!.signal;

      const clientMessageId = generateClientId();
      const now = new Date().toISOString();

      // Optimistic user message — inserted into the cache immediately.
      const optimisticUserMessage: Message = {
        id: clientMessageId,
        conversationId,
        role: 'user',
        content: trimmed,
        status: 'complete',
        createdAt: now,
      };

      queryClient.setQueryData<ConversationWithMessages>(
        queryKeys.conversation(conversationId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, optimisticUserMessage],
          };
        },
      );

      try {
        const stream = sseStream(
          `/api/conversations/${conversationId}/messages`,
          { content: trimmed },
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
          // User cancelled — finalize and sync with server (backend persisted partial content).
          store.getState().finalize('cancelled');
          await queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
          return;
        }

        // Check for 429 rate limit (thrown by sseStream on non-2xx before SSE starts).
        const is429 =
          err instanceof Error &&
          'statusCode' in err &&
          (err as Error & { statusCode: number }).statusCode === 429;

        if (is429) {
          const retryAfter =
            'retryAfter' in err &&
            typeof (err as { retryAfter: unknown }).retryAfter === 'number'
              ? (err as { retryAfter: number }).retryAfter
              : undefined;

          toast.error("You're sending messages too quickly.", {
            description: retryAfter !== undefined
              ? `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before trying again.`
              : 'Please wait before trying again.',
          });

          // Remove the optimistic user message on 429.
          queryClient.setQueryData<ConversationWithMessages>(
            queryKeys.conversation(conversationId),
            (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                messages: prev.messages.filter((m) => m.id !== clientMessageId),
              };
            },
          );

          store.getState().finalize('complete'); // returns to 'idle'
          return;
        }

        // Generic network error.
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        toast.error('Failed to send message.', { description: message });

        // Remove the optimistic message.
        queryClient.setQueryData<ConversationWithMessages>(
          queryKeys.conversation(conversationId),
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== clientMessageId),
            };
          },
        );

        store.getState().finalize('complete'); // returns to 'idle'
      }
    },
    [queryClient],
  );

  const cancel = useCallback(() => {
    store.getState().cancel();
  }, []);

  return { sendMessage, cancel };
}
