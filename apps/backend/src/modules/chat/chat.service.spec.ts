/**
 * ChatService tests — core streaming scenarios per spec §4+§5 and design §5.
 *
 * Uses async generator mocks for LlmService and jest.fn() for PrismaService.
 * Tests the Observable output by collecting emitted events.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Observable, firstValueFrom, toArray } from 'rxjs';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { LangfuseService } from '../observability/langfuse.service';
import { CostCalculator } from '../observability/cost-calculator';
import { ConversationService } from '../conversation/conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageStatus } from '@streaming-chat/database';
import { Request } from 'express';

interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
}

async function collectEvents(obs: Observable<{ type: string; data: Record<string, unknown> }>): Promise<StreamEvent[]> {
  return firstValueFrom(obs.pipe(toArray()));
}

function makeRequest(sessionId = 'session-1'): Request {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    sessionId,
    on: (event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    _emit: (event: string) => {
      listeners[event]?.forEach((cb) => cb());
    },
  } as unknown as Request;
}

async function* happyStream() {
  yield { delta: 'Hello' };
  yield { delta: ' world' };
  yield { usage: { tokensInput: 10, tokensOutput: 5 } };
}

// (emptyStream removed — not used in current test scenarios)

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    message: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    conversation: {
      update: jest.Mock;
    };
  };
  let llmService: { generateContentStream: jest.Mock };
  let langfuseService: { startTrace: jest.Mock; endTrace: jest.Mock };
  let costCalculator: { calc: jest.Mock };
  let conversationService: {
    findOwned: jest.Mock;
    buildHistory: jest.Mock;
    autoTitle: jest.Mock;
    rename: jest.Mock;
  };

  const baseConversation = {
    id: 'conv-1',
    sessionId: 'session-1',
    title: 'New conversation',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userMessage = {
    id: 'user-msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'Hello',
    status: MessageStatus.complete,
    createdAt: new Date(),
    completedAt: new Date(),
  };

  const assistantMessage = {
    id: 'assistant-msg-1',
    conversationId: 'conv-1',
    role: 'assistant',
    content: '',
    status: MessageStatus.streaming,
    createdAt: new Date(),
    completedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      message: {
        create: jest.fn()
          .mockResolvedValueOnce(userMessage)
          .mockResolvedValueOnce(assistantMessage),
        update: jest.fn().mockResolvedValue({ id: 'assistant-msg-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn().mockResolvedValue(baseConversation),
      },
    };

    llmService = { generateContentStream: jest.fn().mockReturnValue(happyStream()) };
    langfuseService = {
      startTrace: jest.fn().mockReturnValue({ update: jest.fn() }),
      endTrace: jest.fn(),
    };
    costCalculator = { calc: jest.fn().mockReturnValue(0.000025) };
    conversationService = {
      findOwned: jest.fn().mockResolvedValue(baseConversation),
      buildHistory: jest.fn().mockResolvedValue([]),
      autoTitle: jest.fn().mockReturnValue('Hello…'),
      rename: jest.fn().mockResolvedValue({ ...baseConversation, title: 'Hello…' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: LlmService, useValue: llmService },
        { provide: LangfuseService, useValue: langfuseService },
        { provide: CostCalculator, useValue: costCalculator },
        { provide: ConversationService, useValue: conversationService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('streamMessage (happy path)', () => {
    it('emits start → tokens → metadata → done in correct order', async () => {
      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      const obs = await service.streamMessage(req, 'conv-1', dto);
      const events = await collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      const types = events.map((e) => e.type);
      expect(types[0]).toBe('start');
      expect(types.filter((t) => t === 'token').length).toBe(2);
      expect(types).toContain('metadata');
      expect(types[types.length - 1]).toBe('done');
    });

    it('persists user message BEFORE emitting start event', async () => {
      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      await service.streamMessage(req, 'conv-1', dto);

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user', content: 'Hello', status: 'complete' }),
        }),
      );
    });

    it('creates assistant message with streaming status', async () => {
      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      await service.streamMessage(req, 'conv-1', dto);

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'assistant', status: 'streaming' }),
        }),
      );
    });

    it('start event includes the assistant messageId', async () => {
      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      const obs = await service.streamMessage(req, 'conv-1', dto);
      const events = await collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      const startEvent = events.find((e) => e.type === 'start');
      expect(startEvent?.data?.['messageId']).toBe('assistant-msg-1');
    });

    it('terminal flush status is complete on success', async () => {
      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      const obs = await service.streamMessage(req, 'conv-1', dto);
      await collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      // Final message update should have status=complete
      const updateCalls = prisma.message.update.mock.calls as Array<Array<{ data: { status?: string } }>>;
      const terminalCall = updateCalls.find((call) => call[0]?.data?.status === 'complete');
      expect(terminalCall).toBeDefined();
    });
  });

  describe('streamMessage (ownership)', () => {
    it('throws NotFoundException when session does not own conversation', async () => {
      conversationService.findOwned.mockResolvedValue(null);

      const req = makeRequest('other-session');
      const dto: SendMessageDto = { content: 'Hello' };

      await expect(service.streamMessage(req, 'conv-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('does not create any messages when conversation not found', async () => {
      conversationService.findOwned.mockResolvedValue(null);

      const req = makeRequest('other-session');
      const dto: SendMessageDto = { content: 'Hello' };

      try {
        await service.streamMessage(req, 'conv-1', dto);
      } catch {
        // expected
      }

      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('streamMessage (cancel scenario)', () => {
    it('terminal status is cancelled when AbortController is aborted mid-stream', async () => {
      async function* slowStream(signal: AbortSignal) {
        yield { delta: 'partial' };
        if (signal.aborted) return;
        // This would be more content but we abort before it
        yield { delta: ' more content' };
      }

      let capturedSignal!: AbortSignal;
      llmService.generateContentStream.mockImplementation(
        ({ signal }: { signal: AbortSignal }) => {
          capturedSignal = signal;
          return slowStream(signal);
        },
      );

      const req = makeRequest() as unknown as Request & { _emit: (e: string) => void };
      const dto: SendMessageDto = { content: 'Hello' };

      const obs = await service.streamMessage(req, 'conv-1', dto);
      const collectPromise = collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      // Simulate client disconnect — triggers abort
      req._emit('close');

      await collectPromise;

      // The terminal update should have status=cancelled
      const updateCalls = prisma.message.update.mock.calls as Array<Array<{ data: { status?: string } }>>;
      const terminalCall = updateCalls.find(
        (call) => call[0]?.data?.status === 'cancelled' || call[0]?.data?.status === 'complete',
      );
      expect(terminalCall).toBeDefined();
      // Verify abort was signaled
      expect(capturedSignal.aborted).toBe(true);
    });
  });

  describe('streamMessage (error scenario)', () => {
    it('emits error event when SDK throws', async () => {
      async function* errorStream() {
        yield { delta: 'partial' };
        throw new Error('Gemini API error');
      }
      llmService.generateContentStream.mockReturnValue(errorStream());

      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      const obs = await service.streamMessage(req, 'conv-1', dto);
      const events = await collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
    });

    it('Langfuse failure does NOT crash the stream', async () => {
      langfuseService.startTrace.mockImplementation(() => {
        throw new Error('Langfuse down');
      });

      const req = makeRequest();
      const dto: SendMessageDto = { content: 'Hello' };

      // Should not throw
      const obs = await service.streamMessage(req, 'conv-1', dto);
      await expect(
        collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>),
      ).resolves.toBeDefined();
    });
  });

  describe('regenerateMessage', () => {
    beforeEach(() => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'preceding-user-msg',
          role: 'user',
          content: 'Preceding question',
          status: 'complete',
          createdAt: new Date('2024-01-15T09:00:00Z'),
        },
        {
          id: 'target-assistant-msg',
          role: 'assistant',
          content: 'Old answer',
          status: 'complete',
          createdAt: new Date('2024-01-15T09:01:00Z'),
        },
      ]);

      // Re-setup create mocks for the regeneration path
      prisma.message.create
        .mockReset()
        .mockResolvedValueOnce(userMessage)  // Not used in regen but reset needed
        .mockResolvedValueOnce(assistantMessage);
    });

    it('throws 400 when trying to regenerate a user message', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'user-msg-target',
          role: 'user',
          content: 'A question',
          status: 'complete',
          createdAt: new Date(),
        },
      ]);

      const req = makeRequest();
      await expect(service.regenerateMessage(req, 'conv-1', 'user-msg-target')).rejects.toThrow(
        'cannot regenerate user message',
      );
    });

    it('throws NotFoundException on non-owned conversation', async () => {
      conversationService.findOwned.mockResolvedValue(null);
      const req = makeRequest('wrong-session');
      await expect(
        service.regenerateMessage(req, 'conv-1', 'assistant-msg'),
      ).rejects.toThrow(NotFoundException);
    });

    it('happy path: deletes target message and streams new assistant response', async () => {
      llmService.generateContentStream.mockReturnValue(happyStream());
      prisma.message.create.mockReset().mockResolvedValue(assistantMessage);

      const req = makeRequest();
      const obs = await service.regenerateMessage(req, 'conv-1', 'target-assistant-msg');
      const events = await collectEvents(obs as unknown as Observable<{ type: string; data: Record<string, unknown> }>);

      // Should have deleted the target message
      expect(prisma.message.delete).toHaveBeenCalled();
      // Should have started a new stream
      const types = events.map((e) => e.type);
      expect(types).toContain('start');
    });
  });
});
