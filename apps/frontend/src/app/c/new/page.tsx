import EmptyState from '@/components/chat/EmptyState';

/**
 * Empty-state landing for new conversations.
 * Rendered when no conversation is selected.
 */
export default function NewConversationPage() {
  return (
    <main className="flex flex-1 flex-col">
      <EmptyState />
    </main>
  );
}
