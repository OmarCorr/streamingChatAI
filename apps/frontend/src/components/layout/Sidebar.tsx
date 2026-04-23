'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SquarePen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConversationList } from '@/components/chat/ConversationList';
import { SidebarToggle } from '@/components/layout/SidebarToggle';
import { postConversation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSidebarStore } from '@/stores/sidebar';

/**
 * M2.H3 — Desktop collapsible sidebar.
 * Collapsed → 64px icon rail; expanded → 240px full list.
 * Transition via CSS transition-all duration-200.
 * Desktop only (hidden md:flex).
 */
export function Sidebar() {
  const { collapsed } = useSidebarStore();
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
    <aside
      className={`hidden md:flex flex-col border-r bg-background transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      aria-label="Conversations sidebar"
    >
      {/* Header row: toggle + new conversation */}
      <div
        className={`flex items-center border-b px-2 py-2 ${
          collapsed ? 'flex-col gap-1' : 'gap-1'
        }`}
      >
        <SidebarToggle />
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={() => createConversation()}
            disabled={isPending}
            aria-label="New conversation"
          >
            <SquarePen aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Conversation list — hidden in icon-only rail mode */}
      {!collapsed && (
        <ScrollArea className="flex-1 py-2">
          <ConversationList />
        </ScrollArea>
      )}

      {/* New conversation at bottom when expanded */}
      {!collapsed && (
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
      )}

      {/* Collapsed: just the toggle + new icon stacked */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => createConversation()}
            disabled={isPending}
            aria-label="New conversation"
          >
            <SquarePen aria-hidden="true" />
          </Button>
        </div>
      )}
    </aside>
  );
}
