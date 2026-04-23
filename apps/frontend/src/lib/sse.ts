import type { StreamEvent } from '@/types/sse';

/**
 * Async generator that connects to an SSE endpoint via fetch + ReadableStream.
 *
 * Design notes (ADR-1, R8):
 * - Uses fetch + AbortController — EventSource is architecturally blocked (POST+cookie).
 * - Buffer accumulates raw text and splits ONLY on '\n\n' to avoid frame-boundary bugs.
 * - Each complete SSE frame is parsed for 'event:' and 'data:' lines.
 * - Yields typed StreamEvent values matching the discriminated union in types/sse.ts.
 * - On AbortError, re-throws so callers can detect cancellation.
 */
export async function* sseStream(
  url: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    const message =
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'message' in errorBody &&
      typeof (errorBody as Record<string, unknown>).message === 'string'
        ? (errorBody as { message: string }).message
        : `HTTP ${response.status}`;

    const retryAfter =
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'retryAfter' in errorBody &&
      typeof (errorBody as Record<string, unknown>).retryAfter === 'number'
        ? (errorBody as { retryAfter: number }).retryAfter
        : undefined;

    throw Object.assign(new Error(message), {
      statusCode: response.status,
      retryAfter,
    });
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += value;

      // Only split on '\n\n' — never on single '\n' (R8: prevents frame-boundary bugs)
      const frames = buffer.split('\n\n');
      // The last element is the incomplete frame — keep it in the buffer
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        if (!frame.trim()) continue;

        let eventType = '';
        let dataLine = '';

        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            dataLine = line.slice('data:'.length).trim();
          }
        }

        if (!eventType || !dataLine) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          continue;
        }

        const event = narrowStreamEvent(eventType, parsed);
        if (event !== null) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function narrowStreamEvent(eventType: string, data: unknown): StreamEvent | null {
  if (!isRecord(data)) return null;

  switch (eventType) {
    case 'start':
      if (typeof data.messageId === 'string') {
        return { type: 'start', data: { messageId: data.messageId } };
      }
      return null;

    case 'token':
      if (typeof data.delta === 'string') {
        return { type: 'token', data: { delta: data.delta } };
      }
      return null;

    case 'metadata':
      if (
        typeof data.tokensInput === 'number' &&
        typeof data.tokensOutput === 'number' &&
        typeof data.costUsd === 'number'
      ) {
        return {
          type: 'metadata',
          data: {
            tokensInput: data.tokensInput,
            tokensOutput: data.tokensOutput,
            costUsd: data.costUsd,
          },
        };
      }
      return null;

    case 'done':
      return { type: 'done', data: { status: 'complete' } };

    case 'error':
      if (typeof data.message === 'string') {
        return {
          type: 'error',
          data: {
            message: data.message,
            ...(typeof data.retryAfter === 'number'
              ? { retryAfter: data.retryAfter }
              : {}),
          },
        };
      }
      return null;

    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
