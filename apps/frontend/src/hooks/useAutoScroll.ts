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

// Walk up from the given element to find the nearest ancestor whose computed
// overflow-y allows scrolling. Needed because `ref` may point at a content div
// inside a wrapper component (e.g. base-ui ScrollArea) whose Viewport is the
// actual scrollable element — setting scrollTop on the content div itself
// would be a no-op.
function getScrollableParent(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const { overflowY } = getComputedStyle(cur);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

export function useAutoScroll(
  ref: RefObject<HTMLDivElement | null>,
  dependency: unknown,
): void {
  // Track whether the user has scrolled up using a ref to avoid stale closures in the effect.
  const userScrolledUp = useRef(false);

  // Attach a scroll listener once to detect manual scroll-up.
  useEffect(() => {
    const content = ref.current;
    if (!content) return;
    const scroller = getScrollableParent(content);
    if (!scroller) return;

    function handleScroll() {
      if (!scroller) return;
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - SCROLL_THRESHOLD;
      userScrolledUp.current = !atBottom;
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [ref]);

  // Scroll to bottom when dependency changes, respecting the pause state.
  useEffect(() => {
    const content = ref.current;
    if (!content) return;
    if (userScrolledUp.current) return;
    const scroller = getScrollableParent(content);
    if (!scroller) return;

    scroller.scrollTop = scroller.scrollHeight;
  }, [dependency, ref]);
}
