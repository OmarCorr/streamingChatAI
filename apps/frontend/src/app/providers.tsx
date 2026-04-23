'use client';

import type { ReactNode } from 'react';
import QueryProvider from '@/providers/QueryProvider';
import ThemeProvider from '@/providers/ThemeProvider';
import ToastProvider from '@/providers/ToastProvider';
import SessionBootstrap from '@/providers/SessionBootstrap';

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root client provider composition.
 * Order: QueryProvider → ThemeProvider → ToastProvider → SessionBootstrap → children
 *
 * ToastProvider must be inside ThemeProvider (sonner reads useTheme).
 * SessionBootstrap must be inside QueryProvider (it writes to Zustand, not TanStack — but
 * keeping it inside the tree ensures consistent placement for future needs).
 */
export default function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <ToastProvider />
        <SessionBootstrap />
        {children}
      </ThemeProvider>
    </QueryProvider>
  );
}
