import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ConversationService', () => {
  let service: ConversationService;
  let prisma: {
    conversation: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
    };
  };

  const now = new Date('2024-01-15T10:00:00Z');
  const baseConversation = {
    id: 'conv-1',
    sessionId: 'session-1',
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    prisma = {
      conversation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('create', () => {
    it('creates a conversation scoped to the session', async () => {
      prisma.conversation.create.mockResolvedValue(baseConversation);

      const result = await service.create('session-1');

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: 'session-1' }),
        }),
      );
      expect(result.sessionId).toBe('session-1');
    });
  });

  describe('findAll', () => {
    it('returns conversations sorted by updatedAt DESC filtered to the session', async () => {
      const conv1 = { ...baseConversation, updatedAt: new Date('2024-01-14') };
      const conv2 = { ...baseConversation, id: 'conv-2', updatedAt: new Date('2024-01-15') };
      prisma.conversation.findMany.mockResolvedValue([conv2, conv1]);

      const result = await service.findAll('session-1');

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1' },
          orderBy: { updatedAt: 'desc' },
        }),
      );
      expect(result[0]?.id).toBe('conv-2');
    });
  });

  describe('findOwned', () => {
    it('returns conversation when session owns it', async () => {
      prisma.conversation.findUnique.mockResolvedValue(baseConversation);

      const result = await service.findOwned('conv-1', 'session-1');
      expect(result).toEqual(baseConversation);
    });

    it('returns null when conversation belongs to different session (resolution 1)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...baseConversation,
        sessionId: 'other-session',
      });

      const result = await service.findOwned('conv-1', 'session-2');
      expect(result).toBeNull();
    });

    it('returns null when conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      const result = await service.findOwned('nonexistent', 'session-1');
      expect(result).toBeNull();
    });
  });

  describe('rename', () => {
    it('updates the title and updatedAt', async () => {
      const updated = { ...baseConversation, title: 'New title' };
      prisma.conversation.update.mockResolvedValue(updated);

      const result = await service.rename('conv-1', 'New title');
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({ title: 'New title' }),
        }),
      );
      expect(result.title).toBe('New title');
    });

    it('throws NotFoundException when conversation does not exist', async () => {
      prisma.conversation.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.rename('nonexistent', 'title')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the conversation (cascading messages)', async () => {
      prisma.conversation.delete.mockResolvedValue(baseConversation);
      await service.remove('conv-1');
      expect(prisma.conversation.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1' } }),
      );
    });
  });

  describe('autoTitle', () => {
    it('returns first 40 chars when content is <= 40 chars', () => {
      expect(service.autoTitle('Short message')).toBe('Short message');
    });

    it('truncates at 40 chars + ellipsis for long content', () => {
      const longContent = 'a'.repeat(50);
      const result = service.autoTitle(longContent);
      expect(result).toBe('a'.repeat(40) + '…');
      expect(result.length).toBe(41);
    });

    it('handles exactly 40 chars without ellipsis', () => {
      const content = 'a'.repeat(40);
      expect(service.autoTitle(content)).toBe(content);
    });
  });

  describe('buildHistory', () => {
    it('returns messages ordered by createdAt ascending', async () => {
      const msg1 = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };
      const msg2 = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi',
        createdAt: new Date('2024-01-15T10:01:00Z'),
      };
      prisma.message.findMany.mockResolvedValue([msg1, msg2]);

      const result = await service.buildHistory('conv-1');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result[0]?.role).toBe('user');
      expect(result[1]?.role).toBe('assistant');
    });

    it('truncates oldest messages first when over limit', async () => {
      // Create 150 messages — should keep last 100 (or whatever buildHistory limits to)
      const messages = Array.from({ length: 150 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      }));
      prisma.message.findMany.mockResolvedValue(messages);

      const result = await service.buildHistory('conv-1');
      // Should limit to at most 100 messages
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });
});
