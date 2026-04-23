/**
 * Centralised TanStack Query key constants.
 * All query keys live here to prevent typos and enable targeted invalidation.
 */
export const queryKeys = {
  /** All conversations for the current session */
  conversations: ['conversations'] as const,

  /** Single conversation with messages */
  conversation: (id: string) => ['conversation', id] as const,

  /** Aggregated usage stats */
  stats: ['stats'] as const,
} as const;
