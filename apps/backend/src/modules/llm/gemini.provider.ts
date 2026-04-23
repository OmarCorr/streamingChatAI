/**
 * GeminiProvider — SDK API verification notes (@google/genai@1.50.1)
 *
 * Verified from dist/genai.d.ts:
 * 1. Entry class: GoogleGenAI (NOT GoogleGenerativeAI)
 *    - Constructor: new GoogleGenAI({ apiKey: string })
 *    - API surface: ai.models.generateContentStream(params: GenerateContentParameters)
 *
 * 2. Method signature:
 *    generateContentStream(params) → Promise<AsyncGenerator<GenerateContentResponse>>
 *    params.model: string
 *    params.contents: ContentListUnion (we use {role, parts:[{text}]} array)
 *    params.config: GenerateContentConfig (systemInstruction, temperature, topP, maxOutputTokens, abortSignal)
 *
 * 3. Chunk shape (GenerateContentResponse):
 *    - chunk.text — GETTER PROPERTY returning string | undefined (not a method call)
 *    - chunk.usageMetadata — GenerateContentResponseUsageMetadata | undefined
 *    - chunk.usageMetadata.promptTokenCount — input tokens
 *    - chunk.usageMetadata.candidatesTokenCount — output tokens
 *
 * 4. AbortSignal location: GenerateContentConfig.abortSignal (NOT in params root)
 *
 * 5. System instruction: GenerateContentConfig.systemInstruction as string
 *
 * Deviation from design skeleton: design used 'config.abortSignal' which is CORRECT per actual SDK.
 * Design's toGeminiContents mapping is implemented below.
 */
import { Injectable } from '@nestjs/common';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { LlmService, LlmStreamChunk, LlmStreamParams } from './llm.service';
import { SYSTEM_PROMPT } from './system-prompt';

@Injectable()
export class GeminiProvider extends LlmService {
  private readonly ai: GoogleGenAI;

  constructor() {
    super();
    this.ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] ?? 'placeholder' });
  }

  async *generateContentStream(params: LlmStreamParams): AsyncIterable<LlmStreamChunk> {
    const stream = await this.ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: this.toGeminiContents(params.messages),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        abortSignal: params.signal,
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.95,
      },
    });

    for await (const chunk of stream) {
      if (params.signal.aborted) break;
      yield* this.normalize(chunk);
    }
  }

  private toGeminiContents(
    messages: LlmStreamParams['messages'],
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages
      .filter((m) => m.role !== 'system')  // system instruction is in config
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }

  private *normalize(chunk: GenerateContentResponse): Iterable<LlmStreamChunk> {
    // chunk.text is a getter property returning string | undefined
    const textDelta = chunk.text;
    if (textDelta) {
      yield { delta: textDelta };
    }

    // Usage metadata arrives on the final chunk
    if (chunk.usageMetadata) {
      yield {
        usage: {
          tokensInput: chunk.usageMetadata.promptTokenCount ?? 0,
          tokensOutput: chunk.usageMetadata.candidatesTokenCount ?? 0,
        },
      };
    }
  }
}
