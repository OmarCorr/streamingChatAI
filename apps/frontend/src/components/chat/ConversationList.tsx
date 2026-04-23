'use client';

import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { DeleteConversationDialog } from '@/components/shared/DeleteConversationDialog';

/**
 * M2.H1 — Renders the full conversation list from TanStack Query.
 * Shows skeletons while loading, empty state on empty array.
 * Manages which conversation's delete dialog is open.
 */
export function ConversationList() {
  const { conversations, isLoading } = useConversations();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-2" role="list" aria-label="Conversations loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
        No conversations yet
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-0.5" role="list" aria-label="Conversations">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            onDeleteClick={(id) => setDeleteTargetId(id)}
          />
        ))}
      </div>

      <DeleteConversationDialog
        conversationId={deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
      />
    </>
  );
}
