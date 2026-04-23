'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SquarePen } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ConversationList } from '@/components/chat/ConversationList';
import { postConversation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSidebarStore } from '@/stores/sidebar';

/**
 * M2.H4 — Mobile sidebar as a Sheet drawer.
 * Controlled by sidebarStore.mobileOpen / closeMobile().
 * Spec scenarios 6.2, 6.4 — always mounted but only shown on mobile.
 */
export function MobileSidebarSheet() {
  const { mobileOpen, closeMobile } = useSidebarStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: createConversation, isPending } = useMutation({
    mutationFn: postConversation,
    onSuccess: async (newConversation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      router.push(`/c/${newConversation.id}`);
      closeMobile();
    },
    onError: () => {
      toast.error('Failed to create conversation. Please try again.');
    },
  });

  return (
    <Sheet
      open={mobileOpen}
      onOpenChange={(open) => {
        if (!open) closeMobile();
      }}
    >
      <SheetContent side="left" className="flex flex-col p-0 w-72">
        <SheetHeader className="border-b p-3">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 py-2">
          <ConversationList />
        </ScrollArea>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => createConversation()}
            disabled={isPending}
            aria-label="New conversation"
          >
            <SquarePen aria-hidden="true" />
            New conversation
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
