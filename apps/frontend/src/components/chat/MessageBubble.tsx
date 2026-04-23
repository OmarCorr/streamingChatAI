'use client';

import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '@/stores/stream';
import { MarkdownRenderer } from './MarkdownRenderer';
import { StreamingIndicator } from './StreamingIndicator';
import { MessageActions } from './MessageActions';
import type { Message } from '@/types/api';

/**
 * M3.L2 — Message bubble component.
 *
 * R3 isolation strategy:
 * - Static bubbles: memo()-wrapped, read only from `message` prop (server cache).
 *   They never subscribe to streamStore — zero re-renders on token events.
 * - The active assistant bubble: rendered as <ActiveAssistantBubble> which subscribes
 *   via useShallow((s) => [s.activeStreamId, s.buffer, s.status]).
 *   This is the ONLY component that re-renders on appendToken().
 * - The parent MessageList does NOT subscribe to streamStore at all.
 *
 * The split into ActiveAssistantBubble + StaticBubble ensures React cannot accidentally
 * re-render a static bubble when the store slice changes.
 */

interface MessageBubbleProps {
  message: Message;
  conversationId: string;
  messageIndex: number;
  onRegenerate?: (conversationId: string, targetIndex: number) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  conversationId,
  messageIndex,
  onRegenerate,
}: MessageBubbleProps) {
  // Check if this bubble is the active streaming target.
  // We read activeStreamId once here (outside useShallow) to decide which branch to render.
  // This selector is a simple scalar — zero re-render cost.
  const isActiveStream = useStreamStore((s) => s.activeStreamId === message.id);

  if (message.role === 'user') {
    return <UserBubble message={message} />;
  }

  if (isActiveStream) {
    return (
      <ActiveAssistantBubble
        message={message}
        conversationId={conversationId}
        messageIndex={messageIndex}
        onRegenerate={onRegenerate}
      />
    );
  }

  return (
    <StaticAssistantBubble
      message={message}
      conversationId={conversationId}
      messageIndex={messageIndex}
      onRegenerate={onRegenerate}
    />
  );
});

// ── User bubble ───────────────────────────────────────────────────────────────

const UserBubble = memo(function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
});

// ── Static (non-streaming) assistant bubble ───────────────────────────────────

interface AssistantBubbleProps {
  message: Message;
  conversationId: string;
  messageIndex: number;
  onRegenerate: ((conversationId: string, targetIndex: number) => void) | undefined;
}

const StaticAssistantBubble = memo(function StaticAssistantBubble({
  message,
  conversationId,
  messageIndex,
  onRegenerate,
}: AssistantBubbleProps) {
  const isStopped = message.status === 'cancelled';
  const isError = message.status === 'error';

  return (
    <div className="flex justify-start group">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm text-foreground relative">
        {isError ? (
          <div className="space-y-2">
            <p className="text-destructive text-sm">
              {message.errorReason ?? 'An error occurred generating this response.'}
            </p>
            {onRegenerate && (
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                onClick={() => onRegenerate(conversationId, messageIndex)}
                aria-label="Retry generating response"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            <MarkdownRenderer content={message.content} />
            {isStopped && (
              <span className="ml-1 text-xs text-muted-foreground italic">(stopped)</span>
            )}
          </>
        )}

        {/* Message actions row — regenerate + copy */}
        {!isError && onRegenerate && (
          <MessageActions
            message={message}
            conversationId={conversationId}
            messageIndex={messageIndex}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
});

// ── Active (streaming) assistant bubble ──────────────────────────────────────
// This is the ONLY component subscribed to streamStore.
// useShallow ensures a single array comparison prevents spurious re-renders
// when other store fields change (e.g. metadata update).

function ActiveAssistantBubble({
  message,
  conversationId: _conversationId,
  messageIndex: _messageIndex,
  onRegenerate: _onRegenerate,
}: AssistantBubbleProps) {
  // R3: scoped subscription — only [activeStreamId, buffer, status] triggers re-render.
  const [, buffer, status] = useStreamStore(
    useShallow((s) => [s.activeStreamId, s.buffer, s.status] as const),
  );

  const isStreaming = status === 'streaming';
  const isStopped = status === 'cancelling' || status === 'cancelled';
  const displayContent = buffer || message.content;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm text-foreground"
        aria-live="polite"
        aria-busy={isStreaming}
        aria-label="Assistant response"
      >
        {buffer === '' && isStreaming ? (
          <StreamingIndicator />
        ) : buffer === '' && isStopped ? (
          <span className="text-muted-foreground italic">(stopped)</span>
        ) : (
          <>
            <MarkdownRenderer content={displayContent} />
            {isStopped && (
              <span className="ml-1 text-xs text-muted-foreground italic">(stopped)</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

