'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * M3.L5 — Auto-scroll hook.
 *
 * Scrolls the target element to its bottom whenever `dependency` changes,
 * but ONLY when the user is already at (or near) the bottom.
 *
 * Pause/resume semantics:
 * - If scrollTop + clientHeight >= scrollHeight - THRESHOLD → user is "at bottom" → scroll.
 * - If user has manually scrolled up beyond the threshold → do NOT override their scroll.
 * - Resume: next time the dependency changes and user is back at bottom, auto-scroll resumes.
 *
 * THRESHOLD of 80px gives a comfortable tolerance for browsers that may not report
 * exact pixel values due to subpixel rendering.
 */

const SCROLL_THRESHOLD = 80;

export function useAutoScroll(
  ref: RefObject<HTMLDivElement | null>,
  dependency: unknown,
): void {
  // Track whether the user has scrolled up using a ref to avoid stale closures in the effect.
  const userScrolledUp = useRef(false);

  // Attach a scroll listener once to detect manual scroll-up.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;
      userScrolledUp.current = !atBottom;
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [ref]);

  // Scroll to bottom when dependency changes, respecting the pause state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (userScrolledUp.current) return;

    el.scrollTop = el.scrollHeight;
  }, [dependency, ref]);
}
