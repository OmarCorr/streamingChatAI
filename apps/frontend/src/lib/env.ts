/**
 * NEXT_PUBLIC_* environment variable validation.
 *
 * R5 resolution — Lighthouse CI without a real backend:
 * NEXT_PUBLIC_LIGHTHOUSE_MODE=1 is set in the GitHub Actions workflow.
 * When truthy, SessionBootstrap skips the POST /api/sessions call and
 * immediately sets sessionReady=true so the app renders a full demo shell
 * that Lighthouse can audit (performance, accessibility, best practices)
 * without a running backend process.
 *
 * All other NEXT_PUBLIC_* vars: none required for v1.
 */
export const env = {
  /** When true, skip real session bootstrap (Lighthouse CI mode). */
  lighthouseMode:
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_LIGHTHOUSE_MODE === '1',
} as const;
