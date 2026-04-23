'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStats } from '@/hooks/useStats';

interface StatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
});

/**
 * M4.Q2 — Stats Dialog.
 *
 * Triggered from Header stats icon button.
 * - Loading: 4 Skeleton placeholders
 * - Error: error message + Retry button (spec scenario 8.3)
 * - Data: aggregated metrics — no PII / no conversation content
 * - Cached within staleTime=30s (spec scenario 8.4)
 */
export function StatsDialog({ open, onOpenChange }: StatsDialogProps) {
  const { data, isLoading, isError, refetch } = useStats(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usage Statistics</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading && (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          )}

          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm text-destructive">
                Failed to load statistics. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                aria-label="Retry loading statistics"
              >
                Retry
              </Button>
            </div>
          )}

          {data && !isLoading && (
            <>
              <StatRow
                label="Messages Processed"
                value={data.messagesProcessed.toLocaleString('en-US')}
              />
              <StatRow
                label="Total Cost"
                value={usdFormatter.format(data.costTotalUsd)}
              />
              <StatRow
                label="Median Latency (P50)"
                value={`${data.latencyP50Ms.toFixed(0)} ms`}
              />
              <StatRow
                label="Tail Latency (P95)"
                value={`${data.latencyP95Ms.toFixed(0)} ms`}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}
