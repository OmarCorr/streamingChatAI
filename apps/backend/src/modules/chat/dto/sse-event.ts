/**
 * SSE event types for streaming chat responses.
 * NestJS @Sse() decorator returns Observable<MessageEvent>
 * where MessageEvent = { type: string; data: string | object }
 *
 * Ordering invariant for successful stream:
 * start → N × token → metadata (once) → done
 *
 * Error path:
 * start → 0..N × token → error
 *
 * Cancel path:
 * start → 0..N × token → (no done; subscriber completes)
 */
export type SseEvent =
  | { type: 'start'; data: { messageId: string } }
  | { type: 'token'; data: { delta: string } }
  | { type: 'metadata'; data: { tokensInput: number; tokensOutput: number; costUsd: number } }
  | { type: 'done'; data: { status: 'complete' } }
  | { type: 'error'; data: { message: string; retryAfter?: number } };
