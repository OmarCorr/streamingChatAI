import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SessionService', () => {
  let service: SessionService;
  let prisma: {
    session: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const now = new Date('2024-01-15T10:00:00Z');
  const baseSession = {
    id: 'session-uuid-1',
    createdAt: now,
    lastActiveAt: now,
    userAgent: 'Mozilla/5.0',
    ipHash: 'abc123hash',
  };

  beforeEach(async () => {
    prisma = {
      session: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('createSession', () => {
    it('creates a new session with ipHash and userAgent', async () => {
      prisma.session.create.mockResolvedValue(baseSession);

      const result = await service.createSession({ ipHash: 'abc123hash', userAgent: 'Mozilla/5.0' });

      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ipHash: 'abc123hash', userAgent: 'Mozilla/5.0' }),
        }),
      );
      expect(result.id).toBe('session-uuid-1');
    });

    it('stores ipHash (not raw IP)', async () => {
      prisma.session.create.mockResolvedValue(baseSession);
      await service.createSession({ ipHash: 'hashed-value', userAgent: null });

      const call = prisma.session.create.mock.calls[0][0] as { data: { ipHash: string } };
      expect(call.data.ipHash).toBe('hashed-value');
    });
  });

  describe('findSession', () => {
    it('returns existing session by id', async () => {
      prisma.session.findUnique.mockResolvedValue(baseSession);

      const result = await service.findSession('session-uuid-1');
      expect(result).toEqual(baseSession);
      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-uuid-1' } }),
      );
    });

    it('returns null for unknown session id', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      const result = await service.findSession('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('touchSession', () => {
    it('updates lastActiveAt for the session', async () => {
      const updatedSession = { ...baseSession, lastActiveAt: new Date('2024-01-15T12:00:00Z') };
      prisma.session.update.mockResolvedValue(updatedSession);

      await service.touchSession('session-uuid-1');

      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-uuid-1' },
        }),
      );
    });
  });
});
