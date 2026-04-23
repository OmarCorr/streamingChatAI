export type StreamEvent =
  | { type: 'start'; data: { messageId: string } }
  | { type: 'token'; data: { delta: string } }
  | { type: 'metadata'; data: { tokensInput: number; tokensOutput: number; costUsd: number } }
  | { type: 'done'; data: { status: 'complete' } }
  | { type: 'error'; data: { message: string; retryAfter?: number } };
