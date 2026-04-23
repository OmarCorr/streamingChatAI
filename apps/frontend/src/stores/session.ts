import { create } from 'zustand';
import { postSession } from '@/lib/api';

interface SessionState {
  sessionReady: boolean;
  sessionError: Error | null;
  /** Calls POST /api/sessions. Idempotent — no-op if already sessionReady. */
  bootstrap: () => Promise<void>;
  /**
   * Directly set sessionReady=true without calling the backend.
   * Used ONLY in Lighthouse CI mode (R5 resolution) where no backend is running.
   */
  setSessionReady: (ready: boolean) => void;
  /** Resets session state (dev-only utility). */
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionReady: false,
  sessionError: null,

  async bootstrap() {
    if (get().sessionReady) return;

    try {
      await postSession();
      set({ sessionReady: true, sessionError: null });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({ sessionError: error, sessionReady: false });
    }
  },

  setSessionReady(ready: boolean) {
    set({ sessionReady: ready, sessionError: null });
  },

  reset() {
    set({ sessionReady: false, sessionError: null });
  },
}));
