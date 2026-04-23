'use client';

import { useState } from 'react';
import { Menu, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar';
import { StatsDialog } from '@/components/stats/StatsDialog';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

/**
 * M4.Q3 + M4.R2 — Application header (fully wired).
 * - Mobile hamburger (< 768px) → opens MobileSidebarSheet via sidebarStore.openMobile()
 * - Stats icon button → opens StatsDialog (replaces Batch 2 placeholder)
 * - ThemeToggle → Light / Dark / System DropdownMenu (replaces Batch 2 placeholder)
 */
export function Header() {
  const { openMobile } = useSidebarStore();
  const [statsOpen, setStatsOpen] = useState(false);

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
      {/* Mobile-only hamburger button */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={openMobile}
        aria-label="Open sidebar"
      >
        <Menu aria-hidden="true" />
      </Button>

      {/* App title */}
      <span className="flex-1 text-sm font-semibold tracking-tight truncate">
        StreamingChat
      </span>

      {/* Stats button — opens StatsDialog (spec scenario 8.1) */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setStatsOpen(true)}
        aria-label="View statistics"
      >
        <BarChart2 aria-hidden="true" />
      </Button>

      {/* Theme toggle — Light / Dark / System (spec scenario 7.2, 7.3) */}
      <ThemeToggle />

      {/* Stats Dialog — enabled only when open to respect staleTime gate */}
      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />
    </header>
  );
}
