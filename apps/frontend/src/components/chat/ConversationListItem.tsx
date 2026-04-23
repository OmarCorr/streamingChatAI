'use client';

import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversation } from '@/types/api';

interface ConversationListItemProps {
  conversation: Conversation;
  onDeleteClick: (id: string) => void;
}

/**
 * M2.H1 (part) — Single conversation row in the sidebar list.
 * Highlights the active conversation based on route params.
 * Exposes a delete trigger that opens the confirm dialog from the parent.
 */
export function ConversationListItem({
  conversation,
  onDeleteClick,
}: ConversationListItemProps) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const isActive = params.id === conversation.id;

  const truncatedTitle =
    conversation.title.length > 40
      ? `${conversation.title.slice(0, 40)}…`
      : conversation.title;

  return (
    <div
      role="listitem"
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
        onClick={() => router.push(`/c/${conversation.id}`)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`Open conversation: ${conversation.title}`}
      >
        {truncatedTitle}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete conversation: ${conversation.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteClick(conversation.id);
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
