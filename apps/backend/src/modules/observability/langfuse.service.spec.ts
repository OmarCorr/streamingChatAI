/**
 * LangfuseService tests
 *
 * SDK API (from inspection of langfuse@3.38.20):
 * - Langfuse class constructor: { publicKey, secretKey, baseUrl? }
 * - client.trace(body?) → LangfuseTraceClient (has .update() method)
 * - client.flushAsync() → Promise<void>
 * - client.shutdownAsync() → Promise<void>
 */
import { Test, TestingModule } from '@nestjs/testing';
import { LangfuseService } from './langfuse.service';

const mockFlushAsync = jest.fn().mockResolvedValue(undefined);
const mockTrace = jest.fn().mockReturnValue({
  update: jest.fn().mockReturnThis(),
  id: 'trace-123',
  traceId: 'trace-123',
});

jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    trace: mockTrace,
    flushAsync: mockFlushAsync,
    shutdownAsync: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('LangfuseService', () => {
  let service: LangfuseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFlushAsync.mockResolvedValue(undefined);
    mockTrace.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      id: 'trace-123',
      traceId: 'trace-123',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [LangfuseService],
    }).compile();

    service = module.get<LangfuseService>(LangfuseService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('init failure does not throw — service remains usable', () => {
    const { Langfuse } = jest.requireMock('langfuse') as { Langfuse: jest.Mock };
    Langfuse.mockImplementationOnce(() => {
      throw new Error('Network error during init');
    });

    // Creating a new service instance with failing constructor should not throw
    expect(() => new LangfuseService()).not.toThrow();
  });

  it('startTrace returns a trace object without throwing', () => {
    const trace = service.startTrace({ name: 'test-trace', input: { msg: 'hello' } });
    expect(trace).toBeDefined();
  });

  it('startTrace never throws even if SDK throws', () => {
    mockTrace.mockImplementationOnce(() => {
      throw new Error('SDK error');
    });
    expect(() => service.startTrace({ name: 'err-trace', input: {} })).not.toThrow();
  });

  it('endTrace never throws', () => {
    const trace = service.startTrace({ name: 'end-test', input: {} });
    expect(() => service.endTrace(trace, { status: 'complete', output: 'result' })).not.toThrow();
  });

  it('endTrace never throws even when trace is null', () => {
    expect(() => service.endTrace(null, { status: 'error', errorReason: 'boom' })).not.toThrow();
  });

  it('flushAsync is called on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockFlushAsync).toHaveBeenCalled();
  });

  it('flush failure is logged not thrown', async () => {
    mockFlushAsync.mockRejectedValueOnce(new Error('flush failed'));
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });
});
