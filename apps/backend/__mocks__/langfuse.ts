/**
 * Manual mock for langfuse package.
 * langfuse@3.38.20 uses dynamic imports in LangfuseMedia which crash
 * Jest CJS mode with ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG.
 *
 * This mock provides the same API surface used by LangfuseService.
 */

export class Langfuse {
  trace = jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    id: 'mock-trace-id',
    traceId: 'mock-trace-id',
  });

  flushAsync = jest.fn().mockResolvedValue(undefined);
  shutdownAsync = jest.fn().mockResolvedValue(undefined);

  constructor(
    _params?: {
      publicKey?: string;
      secretKey?: string;
      baseUrl?: string;
    },
  ) {}
}
