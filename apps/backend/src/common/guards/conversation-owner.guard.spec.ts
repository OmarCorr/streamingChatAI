import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConversationOwnerGuard } from './conversation-owner.guard';
import { PrismaService } from '../../modules/prisma/prisma.service';

function makeContext(conversationId: string, sessionId: string): ExecutionContext {
  const req = {
    params: { id: conversationId },
    sessionId,
  };
  const switchToHttp = jest.fn().mockReturnValue({
    getRequest: jest.fn().mockReturnValue(req),
  });
  return { switchToHttp } as unknown as ExecutionContext;
}

describe('ConversationOwnerGuard', () => {
  let guard: ConversationOwnerGuard;
  let prismaService: {
    conversation: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaService = {
      conversation: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationOwnerGuard,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    guard = module.get<ConversationOwnerGuard>(ConversationOwnerGuard);
  });

  it('allows access when session owns the conversation', async () => {
    const ctx = makeContext('conv-1', 'session-1');
    prismaService.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      sessionId: 'session-1',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws NotFoundException (404) when session does not own the conversation', async () => {
    const ctx = makeContext('conv-1', 'session-2');
    prismaService.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      sessionId: 'session-1',  // different session
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException (404) when conversation does not exist', async () => {
    const ctx = makeContext('nonexistent-conv', 'session-1');
    prismaService.conversation.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('does NOT throw ForbiddenException — must be NotFoundException (resolution 1)', async () => {
    const ctx = makeContext('conv-1', 'session-2');
    prismaService.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      sessionId: 'session-1',
    });

    try {
      await guard.canActivate(ctx);
      fail('expected exception');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
    }
  });
});
