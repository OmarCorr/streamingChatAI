'use client';

import { useStreamStore } from '@/stores/stream';
import type { Message } from '@/types/api';

/**
 * M3.N2 — Per-assistant-message action row.
 *
 * Renders copy + regenerate actions for assistant bubbles.
 * - Copy: writes message.content to clipboard.
 * - Regenerate: disabled when streamStore.status !== 'idle' (spec scenario 4.3).
 * - Visible on hover on desktop (group-hover), always visible on mobile (sm:opacity-100).
 *
 * Usage: rendered inside the parent bubble's group container so hover works correctly.
 */

interface MessageActionsProps {
  message: Message;
  conversationId: string;
  messageIndex: number;
  onRegenerate: (conversationId: string, targetIndex: number) => void;
}

export function MessageActions({
  message,
  conversationId,
  messageIndex,
  onRegenerate,
}: MessageActionsProps) {
  const streamStatus = useStreamStore((s) => s.status);
  const canRegenerate = streamStatus === 'idle';

  function handleCopy() {
    void navigator.clipboard.writeText(message.content);
  }

  function handleRegenerate() {
    if (!canRegenerate) return;
    onRegenerate(conversationId, messageIndex);
  }

  return (
    <div
      className="mt-1 flex items-center gap-3 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity focus-within:opacity-100"
      role="toolbar"
      aria-label="Message actions"
    >
      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleCopy}
        aria-label="Copy message to clipboard"
        type="button"
      >
        Copy
      </button>
      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handleRegenerate}
        disabled={!canRegenerate}
        aria-label={
          canRegenerate
            ? 'Regenerate this response'
            : 'Cannot regenerate while another message is being generated'
        }
        type="button"
      >
        Regenerate
      </button>
    </div>
  );
}
