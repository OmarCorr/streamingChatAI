import { create } from 'zustand';

/**
 * Zustand store for the one active SSE stream in the app.
 *
 * Only ONE stream can be active at a time (guarded by `status !== 'idle'`
 * checks in `useStream` and `useRegenerate`). The store holds the runtime
 * AbortController so the Stop button can abort the fetch without the hooks
 * needing a ref to the controller.
 *
 * Subscription contract — this store is intentionally fine-grained so that:
 * - `MessageList` subscribes to `[activeStreamId, activeConversationId, status]`
 *   only, and re-renders ~2x per stream (start + finalize).
 * - `ActiveAssistantBubble` is the ONLY component that subscribes to `buffer`.
 *   It re-renders once per token, as intended.
 * - `StaticAssistantBubble` does NOT subscribe at all — it reads from the
 *   TanStack Query cache only.
 *
 * This triangle (see `docs/ARCHITECTURE.md § 9`) is what keeps tok-rate
 * re-renders contained to one component. Adding a broad subscription
 * elsewhere will silently break the contract.
 *
 * The `abort` field is a runtime ref (AbortController). Do NOT persist this
 * store — AbortController is not serializable, and an aborted-on-reload
 * controller would be useless anyway.
 */
export type StreamStatus = 'idle' | 'streaming' | 'cancelling' | 'cancelled' | 'error';

interface StreamMetadata {
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

interface StreamState {
  activeStreamId: string | null;
  activeConversationId: string | null;
  buffer: string;
  metadata: StreamMetadata | null;
  status: StreamStatus;
  errorMessage: string | null;
  /** Runtime ref — NEVER serialized to storage */
  abort: AbortController | null;

  start: (conversationId: string) => void;
  setActiveStreamId: (id: string) => void;
  appendToken: (delta: string) => void;
  setMetadata: (m: StreamMetadata) => void;
  setError: (message: string) => void;
  cancel: () => void;
  finalize: (status: 'complete' | 'cancelled' | 'error') => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  activeStreamId: null,
  activeConversationId: null,
  buffer: '',
  metadata: null,
  status: 'idle',
  errorMessage: null,
  abort: null,

  start(conversationId) {
    set({
      activeConversationId: conversationId,
      activeStreamId: null,
      buffer: '',
      metadata: null,
      status: 'streaming',
      errorMessage: null,
      abort: new AbortController(),
    });
  },

  setActiveStreamId(id) {
    set({ activeStreamId: id });
  },

  appendToken(delta) {
    set((state) => ({ buffer: state.buffer + delta }));
  },

  setMetadata(m) {
    set({ metadata: m });
  },

  setError(message) {
    set({ errorMessage: message, status: 'error' });
  },

  cancel() {
    const { abort } = get();
    set({ status: 'cancelling' });
    abort?.abort();
  },

  finalize(status) {
    const nextStatus: StreamStatus =
      status === 'complete' ? 'idle' : status === 'cancelled' ? 'cancelled' : 'error';

    set({
      status: nextStatus,
      abort: null,
      // For 'complete', clear activeStreamId so the server-persisted message renders
      // through StaticAssistantBubble (which shows the Copy/Regenerate actions). For
      // 'cancelled' or 'error', keep it so ActiveAssistantBubble can keep showing the
      // stopped/error indicator bound to that message id.
      activeStreamId: status === 'complete' ? null : get().activeStreamId,
    });
  },
}));
