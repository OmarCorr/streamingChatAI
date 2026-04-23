'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { patchConversation, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Conversation, ConversationWithMessages } from '@/types/api';

interface ConversationHeaderProps {
  conversation: Conversation;
}

const MAX_TITLE_LENGTH = 200;

/**
 * M2.I1 — Inline title editor.
 * Double-click → input pre-populated and autofocused.
 * Enter/blur → trim → validate → optimistic PATCH → rollback on error.
 * Escape → revert with no API call.
 * Empty title rejected: red border + focus retained — spec scenario 5.3.
 * Editing allowed during active stream — spec scenario 5.4.
 */
export function ConversationHeader({ conversation }: ConversationHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Sync draft if the conversation title changes externally (e.g. after invalidation)
  useEffect(() => {
    if (!isEditing) {
      setDraft(conversation.title);
    }
  }, [conversation.title, isEditing]);

  const startEditing = useCallback(() => {
    setDraft(conversation.title);
    setHasError(false);
    setIsEditing(true);
  }, [conversation.title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const cancelEditing = useCallback(() => {
    setDraft(conversation.title);
    setHasError(false);
    setIsEditing(false);
  }, [conversation.title]);

  const saveTitle = useCallback(async () => {
    const trimmed = draft.trim();

    if (trimmed.length === 0) {
      setHasError(true);
      inputRef.current?.focus();
      return;
    }

    if (trimmed.length > MAX_TITLE_LENGTH) {
      setHasError(true);
      inputRef.current?.focus();
      return;
    }

    if (trimmed === conversation.title) {
      setIsEditing(false);
      return;
    }

    // Optimistic update — conversation list
    const previousConversations = queryClient.getQueryData<Conversation[]>(
      queryKeys.conversations,
    );
    queryClient.setQueryData<Conversation[]>(queryKeys.conversations, (old) =>
      old?.map((c) => (c.id === conversation.id ? { ...c, title: trimmed } : c)) ?? [],
    );

    // Optimistic update — conversation detail
    const previousDetail = queryClient.getQueryData<ConversationWithMessages>(
      queryKeys.conversation(conversation.id),
    );
    queryClient.setQueryData<ConversationWithMessages>(
      queryKeys.conversation(conversation.id),
      (old) => (old ? { ...old, title: trimmed } : old),
    );

    setIsEditing(false);

    try {
      await patchConversation(conversation.id, { title: trimmed });
      // Invalidate to sync authoritative title
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    } catch (err) {
      // Rollback optimistic update on error
      queryClient.setQueryData(queryKeys.conversations, previousConversations);
      queryClient.setQueryData(
        queryKeys.conversation(conversation.id),
        previousDetail,
      );
      if (err instanceof ApiError && err.statusCode === 400) {
        toast.error('Title too long (max 200 characters).');
      } else {
        toast.error('Failed to rename conversation. Please try again.');
      }
      // Re-open editing so the user can fix it
      setDraft(trimmed);
      setIsEditing(true);
    }
  }, [draft, conversation.id, conversation.title, queryClient]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void saveTitle();
      } else if (e.key === 'Escape') {
        cancelEditing();
      }
    },
    [saveTitle, cancelEditing],
  );

  const handleBlur = useCallback(() => {
    // Only save on blur if there's no error state holding focus
    if (!hasError) {
      void saveTitle();
    }
  }, [hasError, saveTitle]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => {
            setDraft(e.target.value);
            setHasError(false);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-label="Edit conversation title"
          aria-invalid={hasError}
          className={`flex-1 min-w-0 bg-transparent text-sm font-medium outline-none border rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring ${
            hasError
              ? 'border-destructive ring-2 ring-destructive/20'
              : 'border-border'
          }`}
        />
        {hasError && (
          <span className="text-xs text-destructive shrink-0">
            Title cannot be empty
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b">
      <h1
        className="flex-1 min-w-0 truncate text-sm font-medium cursor-text select-none"
        onDoubleClick={startEditing}
        title="Double-click to rename"
        role="heading"
        aria-level={1}
      >
        {conversation.title}
      </h1>
    </div>
  );
}
