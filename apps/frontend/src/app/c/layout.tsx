import type { ReactNode } from 'react';
import { ChatLayoutShell } from '@/components/layout/ChatLayoutShell';

/**
 * M2.H6 — Layout for all /c/* routes.
 * Wraps children in ChatLayoutShell (Sidebar + Header + Main).
 */
export default function ConversationLayout({ children }: { children: ReactNode }) {
  return <ChatLayoutShell>{children}</ChatLayoutShell>;
}
