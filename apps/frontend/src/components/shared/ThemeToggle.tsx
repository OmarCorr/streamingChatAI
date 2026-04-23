'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Theme = 'light' | 'dark' | 'system';

const themes: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * M4.R1 — Theme Toggle.
 *
 * DropdownMenu with Light / Dark / System options.
 * Uses useTheme() from next-themes (already wired in ThemeProvider).
 *
 * @base-ui/react Menu.Trigger renders its own button element — we pass the
 * icon content as children directly (no asChild pattern needed).
 *
 * Mounted-guard prevents SSR hydration mismatch — rendered only after client
 * hydration (next-themes resolves the theme on the client; rendering the icon
 * server-side would produce a mismatch between the server's unknown default
 * and the client's resolved theme class).
 *
 * No FOUC: ThemeProvider has attribute="class" + suppressHydrationWarning on
 * <html> (wired in M1.F1 / layout.tsx).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolvedTheme = (theme ?? 'system') as Theme;

  // Prevent SSR hydration mismatch — render a stable placeholder until mounted.
  if (!mounted) {
    return (
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md opacity-0"
        aria-label="Toggle theme"
        disabled
        aria-hidden="true"
      >
        <Sun className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  const CurrentIcon =
    resolvedTheme === 'dark' ? Moon : resolvedTheme === 'light' ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Current theme: ${resolvedTheme}. Click to change.`}
      >
        <CurrentIcon className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {themes.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            aria-current={theme === value ? 'true' : undefined}
            className="flex items-center gap-2"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            {theme === value && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
