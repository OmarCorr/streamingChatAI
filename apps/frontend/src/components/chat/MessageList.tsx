'use client';

import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '@/stores/stream';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { MessageBubble } from './MessageBubble';
import { StreamingIndicator } from './StreamingIndicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { Message, ConversationWithMessages } from '@/types/api';

/**
 * M3.L4 — Message list with streaming overlay.
 *
 * R3 isolation:
 * - This component subscribes to streamStore ONLY to know whether to render the
 *   optimistic streaming bubble. It does NOT subscribe to `buffer` — that's
 *   MessageBubble's (specifically ActiveAssistantBubble's) job.
 * - The selector [activeStreamId, activeConversationId, status] changes only on
 *   start/finalize events (not on every token) so MessageList re-renders ~2x per
 *   conversation (once on start, once on done/cancel) — never per token.
 */

interface MessageListProps {
  conversation: ConversationWithMessages;
  isLoading: boolean;
  onRegenerate: (conversationId: string, targetIndex: number) => void;
}

export function MessageList({ conversation, isLoading, onRegenerate }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Selective subscription: only start/finalize events trigger MessageList re-render.
  // `buffer` is intentionally excluded — appendToken does NOT cause MessageList to re-render.
  const [activeStreamId, activeConversationId, status] = useStreamStore(
    useShallow((s) => [s.activeStreamId, s.activeConversationId, s.status] as const),
  );

  const isStreamingHere =
    (status === 'streaming' || status === 'cancelling') &&
    activeConversationId === conversation.id;

  // Use buffer changes to drive auto-scroll (we subscribe to buffer only for this effect).
  const buffer = useStreamStore((s) => s.buffer);
  useAutoScroll(scrollRef, `${conversation.messages.length}-${buffer.length}`);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-10 w-1/2 ml-auto" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  const messages = conversation.messages;

  // Build the display list: server messages + streaming assistant bubble overlay.
  // The streaming assistant bubble is only appended when status is 'streaming'
  // and the activeStreamId is NOT yet in the server messages (i.e., before finalize).
  const serverMessageIds = new Set(messages.map((m) => m.id));
  const showStreamingBubble =
    isStreamingHere &&
    activeStreamId !== null &&
    !serverMessageIds.has(activeStreamId);

  // Synthetic streaming message — mimics Message shape for MessageBubble.
  const streamingMessage: Message | null = showStreamingBubble
    ? {
        id: activeStreamId!,
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: new Date().toISOString(),
      }
    : null;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div ref={scrollRef} className="flex flex-col gap-3 p-4 min-h-full">
        {messages.length === 0 && !isStreamingHere && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            No messages yet. Send a message to start the conversation.
          </p>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            conversationId={conversation.id}
            messageIndex={index}
            onRegenerate={onRegenerate}
          />
        ))}

        {streamingMessage && (
          <MessageBubble
            key={streamingMessage.id}
            message={streamingMessage}
            conversationId={conversation.id}
            messageIndex={messages.length}
          />
        )}

        {/* When streaming has started but activeStreamId not yet set (pre-start event) */}
        {isStreamingHere && activeStreamId === null && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
              <StreamingIndicator />
            </div>
          </div>
        )}

        {/* Sentinel element for scroll target */}
        <div aria-hidden="true" />
      </div>
    </ScrollArea>
  );
}
