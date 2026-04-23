/**
 * GeminiProvider tests
 *
 * SDK API discovered (verified from @google/genai@1.50.1 dist/genai.d.ts):
 * - Class: GoogleGenAI (NOT GoogleGenerativeAI)
 * - Method: ai.models.generateContentStream(params) → Promise<AsyncGenerator<GenerateContentResponse>>
 * - Chunk text: chunk.text is a GETTER PROPERTY (not method call), returns string | undefined
 * - Usage metadata: chunk.usageMetadata.promptTokenCount (input), chunk.usageMetadata.candidatesTokenCount (output)
 * - AbortSignal: placed in GenerateContentConfig.abortSignal (not in params root)
 * - Messages are 'contents' in GenerateContentParameters, using { role, parts: [{text}] } format
 */

// The mock must be defined before imports that trigger module loading
const mockGenerateContentStream = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContentStream: mockGenerateContentStream,
    },
  })),
}));

import { GeminiProvider } from './gemini.provider';

async function* makeStreamGenerator(
  chunks: Array<Record<string, unknown>>,
): AsyncGenerator<unknown> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  const defaultParams = {
    messages: [
      { role: 'user' as const, content: 'Hello, how are you?' },
    ],
    signal: new AbortController().signal,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GeminiProvider();
  });

  it('is defined', () => {
    expect(provider).toBeDefined();
  });

  it('yields normalized chunks with delta text', async () => {
    const chunks: Array<Record<string, unknown>> = [
      { text: 'Hello' },
      { text: ' world' },
    ];
    mockGenerateContentStream.mockResolvedValue(makeStreamGenerator(chunks));

    const result: Array<{ delta?: string; usage?: unknown }> = [];
    for await (const chunk of provider.generateContentStream(defaultParams)) {
      result.push(chunk);
    }

    const textChunks = result.filter((c) => c.delta);
    expect(textChunks.length).toBeGreaterThanOrEqual(1);
    expect(textChunks[0]?.delta).toBe('Hello');
  });

  it('yields usage metadata chunk when usageMetadata present', async () => {
    const chunks: Array<Record<string, unknown>> = [
      { text: 'Hi' },
      {
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ];
    mockGenerateContentStream.mockResolvedValue(makeStreamGenerator(chunks));

    const result: Array<{ delta?: string; usage?: { tokensInput: number; tokensOutput: number } }> = [];
    for await (const chunk of provider.generateContentStream(defaultParams)) {
      result.push(chunk);
    }

    const usageChunk = result.find((c) => c.usage);
    expect(usageChunk).toBeDefined();
    expect(usageChunk?.usage?.tokensInput).toBe(10);
    expect(usageChunk?.usage?.tokensOutput).toBe(5);
  });

  it('passes abortSignal to SDK config', async () => {
    const controller = new AbortController();
    mockGenerateContentStream.mockResolvedValue(makeStreamGenerator([]));

    const params = { ...defaultParams, signal: controller.signal };
    const iter = provider.generateContentStream(params);
    // Exhaust the iterator
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of iter) { /* empty */ }

    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ abortSignal: controller.signal }),
      }),
    );
  });

  it('propagates SDK errors as thrown exceptions', async () => {
    mockGenerateContentStream.mockRejectedValue(new Error('SDK network error'));

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.generateContentStream(defaultParams)) { /* empty */ }
    }).rejects.toThrow('SDK network error');
  });

  it('breaks iteration when abortSignal is aborted', async () => {
    const controller = new AbortController();

    // Simulate aborting immediately when iterating
    async function* slowStream(): AsyncGenerator<unknown> {
      yield { text: 'First chunk' };
      controller.abort();  // Abort after first chunk
      yield { text: 'Second chunk — should not be seen' };
    }
    mockGenerateContentStream.mockResolvedValue(slowStream());

    const params = { ...defaultParams, signal: controller.signal };
    const result: string[] = [];
    for await (const chunk of provider.generateContentStream(params)) {
      if (chunk.delta) result.push(chunk.delta);
    }

    // After abort, should have stopped — the second chunk should not appear
    expect(result).not.toContain('Second chunk — should not be seen');
  });
});
