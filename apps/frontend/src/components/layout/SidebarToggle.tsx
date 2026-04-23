'use client';

import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar';

/**
 * M2.H3 (part) — Desktop sidebar collapse/expand toggle button.
 * Reads and writes sidebarStore.collapsed via toggle().
 */
export function SidebarToggle() {
  const { collapsed, toggle } = useSidebarStore();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
    >
      <PanelLeft aria-hidden="true" />
    </Button>
  );
}
