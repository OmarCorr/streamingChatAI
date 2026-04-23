'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { postConversation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Empty state shown at /c/new before any conversation is created.
 * "New conversation" CTA wired in Batch 2 — creates conversation and navigates.
 */
export default function EmptyState() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: createConversation, isPending } = useMutation({
    mutationFn: postConversation,
    onSuccess: async (newConversation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      router.push(`/c/${newConversation.id}`);
    },
    onError: () => {
      toast.error('Failed to create conversation. Please try again.');
    },
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <MessageSquarePlus
        className="text-muted-foreground size-12"
        aria-hidden="true"
      />
      <h1 className="text-xl font-semibold tracking-tight">Start a conversation</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Ask anything — the AI will respond in real time as it generates each token.
      </p>
      <Button
        onClick={() => createConversation()}
        disabled={isPending}
        aria-label="New conversation"
      >
        <MessageSquarePlus aria-hidden="true" />
        New conversation
      </Button>
    </div>
  );
}
