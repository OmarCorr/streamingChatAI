'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileSidebarSheet } from '@/components/layout/MobileSidebarSheet';
import { Header } from '@/components/layout/Header';

/**
 * M2.H6 — Full chat layout shell.
 * Desktop: flex h-screen → [Sidebar 240/64px][Header + main flex-1]
 * Mobile: hidden sidebar, hamburger in Header opens MobileSidebarSheet.
 * Design §2.1 layout contract.
 */
export function ChatLayoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile via hidden md:flex inside Sidebar */}
      <Sidebar />

      {/* Mobile drawer — always mounted, Sheet controls visibility */}
      <MobileSidebarSheet />

      {/* Main content column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
