import { LlmStreamChunk, LlmStreamParams } from './interfaces/stream-chunk';

export { LlmStreamChunk, LlmStreamParams };

export abstract class LlmService {
  abstract generateContentStream(params: LlmStreamParams): AsyncIterable<LlmStreamChunk>;
}
