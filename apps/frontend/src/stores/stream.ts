import { create } from 'zustand';

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
      // Keep activeStreamId so MessageBubble can still reference the final message
    });
  },
}));
