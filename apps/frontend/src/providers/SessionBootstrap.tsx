'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/stores/session';
import { env } from '@/lib/env';

/**
 * Mounts at root layout level. Fires POST /api/sessions once on mount.
 * Renders null when healthy (transparent pass-through).
 * Renders a full-page retry screen if session bootstrap fails.
 *
 * Spec coverage:
 * - Scenario 1.3: 5xx → sessionReady stays false, retry affordance shown
 * - Scenario 1.4: Network error → same retry affordance
 *
 * R5 resolution (Lighthouse CI):
 * When NEXT_PUBLIC_LIGHTHOUSE_MODE=1, immediately set sessionReady=true
 * without calling POST /api/sessions. This allows Lighthouse to audit the
 * full rendered shell (performance, accessibility, best practices) without
 * a running backend — see lib/env.ts and .github/workflows/lighthouse.yml.
 */
export default function SessionBootstrap() {
  const sessionError = useSessionStore((s) => s.sessionError);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const setSessionReady = useSessionStore((s) => s.setSessionReady);

  useEffect(() => {
    if (env.lighthouseMode) {
      // Skip real session bootstrap in Lighthouse CI mode.
      // sessionReady is set immediately so all TanStack Query hooks become enabled
      // and the app renders a full shell for Lighthouse to audit.
      setSessionReady(true);
      return;
    }
    void bootstrap();
    // bootstrap is stable (Zustand action ref is stable across renders).
    // sessionReady is checked inside bootstrap() itself (idempotent).
  }, [bootstrap, setSessionReady]);

  if (sessionError !== null && !env.lighthouseMode) {
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <p className="text-destructive text-lg font-semibold">
          Could not connect to the server.
        </p>
        <p className="text-muted-foreground text-sm">{sessionError.message}</p>
        <button
          type="button"
          onClick={() => void bootstrap()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
