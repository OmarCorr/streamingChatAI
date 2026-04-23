'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * M4.S1 — Chat Pane Error Boundary.
 *
 * Pattern chosen: class component with getDerivedStateFromError +
 * componentDidCatch. This is the ONLY pattern that can:
 *   (a) wrap only the chat pane (not the full layout), keeping the sidebar
 *       visible on error (spec scenario 10.1)
 *   (b) work with both React 19 and Next.js 15 App Router
 *
 * Next.js error.tsx is route-scoped (full segment) and cannot be placed
 * around just the chat content area — that's why we use a class component
 * directly in the page.
 *
 * On render error: shows fallback UI with error message + Reload button.
 * Does NOT catch async errors (those are surfaced via Sonner toasts in
 * the QueryClient error handler — see lib/queryClient.ts M4.S2).
 */
export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // In production you would send this to an error tracking service (e.g. Sentry).
    // For v1, log to console so it is visible during manual smoke testing.
    console.error('[ChatErrorBoundary] Render error caught:', error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center"
        >
          <p className="text-sm font-semibold text-destructive">
            Something went wrong in the chat pane.
          </p>
          {this.state.errorMessage && (
            <p className="text-xs text-muted-foreground max-w-sm">
              {this.state.errorMessage}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReload}
            aria-label="Reload the page to recover"
          >
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
