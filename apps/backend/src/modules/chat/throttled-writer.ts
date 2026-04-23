/**
 * ThrottledWriter — per-stream instance, NOT injectable as a service.
 *
 * Owns buffer, timer, token counter, and finalized flag for a single streaming message.
 * Flushes to DB either:
 * - When the buffer accumulates >= options.tokens tokens (immediate)
 * - When options.timeMs elapses without a flush (timer)
 * - When flush({ final: true }) is called (terminal, always wins)
 *
 * Race-safety invariants:
 * - finalized prevents double-flush and post-terminal accumulation
 * - pendingFlush is awaited before terminal write lands
 * - Timer always cleared before any write (no ghost timers)
 */
import { PrismaClient, MessageStatus } from '@streaming-chat/database';

export class ThrottledWriter {
  private buffer = '';
  public content = '';
  private tokenCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingFlush: Promise<void> | null = null;
  private finalized = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly messageId: string,
    private readonly options: { timeMs: number; tokens: number } = {
      timeMs: 500,
      tokens: 100,
    },
  ) {}

  accumulate(delta: string): void {
    if (this.finalized) return;
    this.buffer += delta;
    this.content += delta;
    this.tokenCount++;

    if (this.tokenCount >= this.options.tokens) {
      void this.writeNow();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.writeNow(), this.options.timeMs);
    }
  }

  private async writeNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;

    const contentSnapshot = this.content;
    this.buffer = '';
    this.tokenCount = 0;

    this.pendingFlush = this.prisma.message
      .update({
        where: { id: this.messageId },
        data: { content: contentSnapshot, tokensOutput: contentSnapshot.length },
      })
      .then(() => undefined)
      .catch((err) => {
        // Log but do NOT throw. Stream must continue.
        // Failed progressive writes will be reconciled by terminal flush.
        console.warn('[ThrottledWriter] progressive write failed:', (err as Error).message);
      });
    await this.pendingFlush;
  }

  async flush(finalOpts: {
    final: true;
    status: MessageStatus;
    errorReason?: string;
    completedAt: Date;
  }): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Wait for any in-flight progressive write to complete
    if (this.pendingFlush) await this.pendingFlush;

    // Terminal write — owns status, completedAt, final content
    await this.prisma.message.update({
      where: { id: this.messageId },
      data: {
        content: this.content,
        status: finalOpts.status,
        completedAt: finalOpts.completedAt,
        ...(finalOpts.errorReason !== undefined ? { errorReason: finalOpts.errorReason } : {}),
      },
    });
  }
}
