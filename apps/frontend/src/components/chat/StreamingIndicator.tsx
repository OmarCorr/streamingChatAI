'use client';

/**
 * M3.L3 — Animated typing-dots indicator shown before the first token arrives.
 *
 * Design notes (design §8 — a11y):
 * - prefers-reduced-motion: animation removed via CSS media query.
 * - Three dots with staggered animation-delay for a natural pulse feel.
 * - Uses Tailwind animate-bounce (respects reduce-motion via Tailwind defaults) plus
 *   a custom stagger via inline style delay.
 */
export function StreamingIndicator() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1"
      aria-label="Assistant is typing"
      role="status"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
