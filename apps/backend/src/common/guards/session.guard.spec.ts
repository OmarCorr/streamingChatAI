import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from './session.guard';
import { PrismaService } from '../../modules/prisma/prisma.service';

function makeContext(cookieSid?: string, ip = '127.0.0.1'): ExecutionContext {
  const cookies: Record<string, string> = {};
  if (cookieSid) {
    cookies['sid'] = cookieSid;
  }
  const setCookie = jest.fn();
  const req = {
    cookies,
    signedCookies: cookieSid ? { sid: cookieSid } : {},
    connection: { remoteAddress: ip },
    ip,
    headers: {},
  };
  const res = {
    cookie: setCookie,
  };
  const switchToHttp = jest.fn().mockReturnValue({
    getRequest: jest.fn().mockReturnValue(req),
    getResponse: jest.fn().mockReturnValue(res),
  });
  return { switchToHttp } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let prismaService: {
    session: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const existingSession = {
    id: 'existing-session-id',
    createdAt: new Date('2024-01-01'),
    lastActiveAt: new Date('2024-01-01'),
    userAgent: null,
    ipHash: 'some-hash',
  };

  beforeEach(async () => {
    prismaService = {
      session: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGuard,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    guard = module.get<SessionGuard>(SessionGuard);
  });

  it('creates a new session when no cookie present', async () => {
    const ctx = makeContext();
    const newSession = { ...existingSession, id: 'new-session-id' };
    prismaService.session.create.mockResolvedValue(newSession);

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(prismaService.session.create).toHaveBeenCalled();
    const req = ctx.switchToHttp().getRequest<{ sessionId?: string }>();
    expect(req.sessionId).toBe('new-session-id');
  });

  it('reuses existing session when valid signed cookie present', async () => {
    const ctx = makeContext('existing-session-id');
    prismaService.session.findUnique.mockResolvedValue(existingSession);
    prismaService.session.update.mockResolvedValue({ ...existingSession, lastActiveAt: new Date() });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(prismaService.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-session-id' } }),
    );
    const req = ctx.switchToHttp().getRequest<{ sessionId?: string }>();
    expect(req.sessionId).toBe('existing-session-id');
  });

  it('creates new session when cookie session not found in DB', async () => {
    const ctx = makeContext('stale-session-id');
    prismaService.session.findUnique.mockResolvedValue(null);
    const newSession = { ...existingSession, id: 'brand-new-id' };
    prismaService.session.create.mockResolvedValue(newSession);

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(prismaService.session.create).toHaveBeenCalled();
    const req = ctx.switchToHttp().getRequest<{ sessionId?: string }>();
    expect(req.sessionId).toBe('brand-new-id');
  });

  it('attaches sessionId to request', async () => {
    const ctx = makeContext();
    const newSession = { ...existingSession, id: 'attached-session-id' };
    prismaService.session.create.mockResolvedValue(newSession);

    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<{ sessionId?: string }>();
    expect(req.sessionId).toBe('attached-session-id');
  });

  it('sets an HTTP-only cookie with the session id', async () => {
    const ctx = makeContext();
    const newSession = { ...existingSession, id: 'cookie-test-id' };
    prismaService.session.create.mockResolvedValue(newSession);

    await guard.canActivate(ctx);
    const res = ctx.switchToHttp().getResponse<{ cookie: jest.Mock }>();
    expect(res.cookie).toHaveBeenCalledWith(
      'sid',
      'cookie-test-id',
      expect.objectContaining({ httpOnly: true }),
    );
  });
});
