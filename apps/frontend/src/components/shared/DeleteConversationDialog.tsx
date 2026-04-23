'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deleteConversation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface DeleteConversationDialogProps {
  /** The id of the conversation to delete, or null when dialog is closed */
  conversationId: string | null;
  onClose: () => void;
}

/**
 * M2.H2 — Confirmation dialog for destructive conversation deletion.
 * Focus starts on "Cancel" (destructive-safe per design §8).
 * On confirm: DELETE → invalidate ['conversations'] → navigate if active.
 */
export function DeleteConversationDialog({
  conversationId,
  onClose,
}: DeleteConversationDialogProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ id?: string }>();

  const isOpen = conversationId !== null;

  async function handleDelete() {
    if (!conversationId) return;

    try {
      await deleteConversation(conversationId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });

      // If the deleted conversation was the active one, navigate away — spec scenario 2.5
      if (params.id === conversationId) {
        router.replace('/c/new');
      }

      onClose();
    } catch {
      toast.error('Failed to delete conversation. Please try again.');
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete conversation?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The conversation and all its messages will be
            permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Focus starts on Cancel — destructive-safe per design §8 */}
          <Button
            variant="outline"
            autoFocus
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
