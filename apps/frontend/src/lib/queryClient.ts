import { QueryClient, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

/**
 * Factory function — creates a fresh QueryClient instance.
 * Used in QueryProvider (client components) to avoid shared state between requests.
 *
 * M4.S2 — Global QueryCache error handler.
 * Non-2xx errors that are NOT:
 *   - 404 (handled silently by useConversation redirect — spec scenario 10.3)
 *   - 429 (handled with retryAfter toast in useStream — spec scenario 3.4)
 * … are surfaced as Sonner toasts (spec scenario 10.2).
 *
 * This is the centralised error surface — individual hooks do NOT call toast.error
 * for generic network failures. Only the two special cases above handle their own toasts.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (
          error instanceof ApiError &&
          error.statusCode !== 404 &&
          error.statusCode !== 429
        ) {
          toast.error('Request failed', {
            description: error.message,
          });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
      },
    },
  });
}
