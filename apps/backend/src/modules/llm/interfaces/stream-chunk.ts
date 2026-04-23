/**
 * LLM stream interfaces — provider-agnostic.
 * GeminiProvider normalizes SDK chunks to LlmStreamChunk.
 */

export interface LlmStreamChunk {
  delta?: string;
  usage?: { tokensInput: number; tokensOutput: number };
}

export interface LlmStreamParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  signal: AbortSignal;
}
