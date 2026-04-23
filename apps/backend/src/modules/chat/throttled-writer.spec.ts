/**
 * ThrottledWriter tests — uses jest fake timers per Resolution 2.
 *
 * Invariants under test:
 * 1. Accumulates < 100 tokens → triggers timer flush at 500ms
 * 2. Accumulates ≥ 100 tokens → immediate flush (no wait for timer)
 * 3. flush({final:true}) waits for pending writes and writes terminal status
 * 4. finalized flag prevents double-flush (idempotent)
 * 5. Stale progressive write cannot clobber terminal write
 * 6. Timer cleared on flush (no ghost timers)
 * 7. accumulate() is no-op after finalized
 */
import { ThrottledWriter } from './throttled-writer';
import { MessageStatus } from '@streaming-chat/database';

function makePrisma(): {
  message: { update: jest.Mock };
} {
  return {
    message: { update: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  };
}

describe('ThrottledWriter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('flushes at 500ms timer when < 100 tokens accumulated', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(
      prisma as never,
      'msg-1',
      { timeMs: 500, tokens: 100 },
    );

    writer.accumulate('hello ');
    writer.accumulate('world');
    expect(prisma.message.update).not.toHaveBeenCalled();

    // Advance timer to trigger the flush
    jest.advanceTimersByTime(500);
    // Wait for async DB write to complete
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.message.update).toHaveBeenCalled();
  });

  it('flushes immediately when ≥ 100 tokens accumulated', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(
      prisma as never,
      'msg-1',
      { timeMs: 500, tokens: 3 },
    );

    writer.accumulate('a');
    writer.accumulate('b');
    expect(prisma.message.update).not.toHaveBeenCalled();

    writer.accumulate('c'); // 3rd token hits threshold
    // Flush should be triggered immediately (synchronously queued)
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.message.update).toHaveBeenCalled();
  });

  it('final flush writes terminal status and completedAt', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(prisma as never, 'msg-1');

    writer.accumulate('partial content');

    const completedAt = new Date('2024-01-15T10:00:00Z');
    await writer.flush({
      final: true,
      status: MessageStatus.complete,
      completedAt,
    });

    // Final flush should include status and completedAt
    const lastCall = prisma.message.update.mock.calls[
      prisma.message.update.mock.calls.length - 1
    ] as Array<{ data: Record<string, unknown> }>;
    const data = lastCall[0]?.data;
    expect(data?.status).toBe(MessageStatus.complete);
    expect(data?.completedAt).toBe(completedAt);
    expect(data?.content).toBe('partial content');
  });

  it('double flush is idempotent — second flush is no-op', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(prisma as never, 'msg-1');

    writer.accumulate('some text');

    await writer.flush({ final: true, status: MessageStatus.complete, completedAt: new Date() });
    const callsAfterFirst = prisma.message.update.mock.calls.length;

    await writer.flush({ final: true, status: MessageStatus.complete, completedAt: new Date() });
    const callsAfterSecond = prisma.message.update.mock.calls.length;

    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('accumulate() is no-op after finalized', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(prisma as never, 'msg-1', { timeMs: 500, tokens: 2 });

    writer.accumulate('a');
    await writer.flush({ final: true, status: MessageStatus.complete, completedAt: new Date() });

    const callsAfterFinalize = prisma.message.update.mock.calls.length;

    // These should be no-ops
    writer.accumulate('b');
    writer.accumulate('c');

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.message.update.mock.calls.length).toBe(callsAfterFinalize);
  });

  it('timer is cleared when flush is called before timer fires', async () => {
    const prisma = makePrisma();
    const writer = new ThrottledWriter(prisma as never, 'msg-1', { timeMs: 5000, tokens: 1000 });

    writer.accumulate('token');
    // Timer is now set but not fired

    await writer.flush({ final: true, status: MessageStatus.cancelled, completedAt: new Date() });

    const callsAfterFlush = prisma.message.update.mock.calls.length;

    // Advance timer past the original time — should NOT trigger another update
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.message.update.mock.calls.length).toBe(callsAfterFlush);
  });

  it('terminal flush waits for pending progressive write before writing final status', async () => {
    let resolveProgressiveWrite!: () => void;
    const progressiveWritePromise = new Promise<{ id: string }>((resolve) => {
      resolveProgressiveWrite = () => resolve({ id: 'msg-1' });
    });

    const prisma = {
      message: {
        update: jest.fn()
          .mockReturnValueOnce(progressiveWritePromise)
          .mockResolvedValue({ id: 'msg-1' }),
      },
    };

    const writer = new ThrottledWriter(
      prisma as never,
      'msg-1',
      { timeMs: 500, tokens: 1 },
    );

    // Trigger a progressive write (threshold = 1 token)
    writer.accumulate('a');
    await Promise.resolve(); // let the async write start

    // Now trigger final flush BEFORE progressive write resolves
    const flushPromise = writer.flush({
      final: true,
      status: MessageStatus.complete,
      completedAt: new Date(),
    });

    // Resolve the progressive write now
    resolveProgressiveWrite();

    await flushPromise;

    // Progressive write should have happened FIRST, then terminal write
    expect(prisma.message.update).toHaveBeenCalledTimes(2);
    const terminalCall = prisma.message.update.mock.calls[1] as Array<{ data: Record<string, unknown> }>;
    expect(terminalCall[0]?.data?.status).toBe(MessageStatus.complete);
  });

  it('progressive write failure does not throw — stream continues', async () => {
    const prisma = {
      message: {
        update: jest.fn()
          .mockRejectedValueOnce(new Error('DB connection lost'))
          .mockResolvedValue({ id: 'msg-1' }),
      },
    };

    const writer = new ThrottledWriter(
      prisma as never,
      'msg-1',
      { timeMs: 500, tokens: 1 },
    );

    writer.accumulate('a');
    await Promise.resolve();
    await Promise.resolve();

    // Even though the write failed, we can still flush
    await expect(
      writer.flush({ final: true, status: MessageStatus.complete, completedAt: new Date() }),
    ).resolves.not.toThrow();
  });
});
