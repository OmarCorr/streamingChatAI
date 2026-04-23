'use client';

import { useParams } from 'next/navigation';
import { useConversation } from '@/hooks/useConversation';
import { useStream } from '@/hooks/useStream';
import { useRegenerate } from '@/hooks/useRegenerate';
import { ConversationHeader } from '@/components/chat/ConversationHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * M3.O1 — Fully wired conversation page.
 *
 * Assembles: ConversationHeader + MessageList + MessageInput.
 * - useStream provides sendMessage + cancel.
 * - useRegenerate provides regenerate.
 * - 404 auto-redirect handled inside useConversation (spec scenario 10.3).
 * - aria-live is on the streaming MessageBubble (not the page root) per ADR-8.
 */
export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: conversation, isLoading } = useConversation(id);
  const { sendMessage, cancel } = useStream();
  const { regenerate } = useRegenerate();

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-10 w-1/2 ml-auto" />
          <Skeleton className="h-10 w-2/3" />
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    // useConversation already navigated to /c/new on 404.
    return null;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ConversationHeader conversation={conversation} />

      {/* M4.S1 — ChatErrorBoundary wraps only the chat pane content (not the full
          layout shell) so the sidebar remains visible if a render error occurs
          (spec scenario 10.1). Class component chosen over Next.js error.tsx
          because error.tsx is route-scoped and cannot target just this area. */}
      <ChatErrorBoundary>
        <MessageList
          conversation={conversation}
          isLoading={false}
          onRegenerate={regenerate}
        />

        <MessageInput
          conversationId={id}
          onSend={sendMessage}
          onCancel={cancel}
        />
      </ChatErrorBoundary>
    </div>
  );
}
