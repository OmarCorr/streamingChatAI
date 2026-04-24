import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { env } from '../../env';

// Extend Express Request to carry the sessionId attached by this guard
declare module 'express' {
  interface Request {
    sessionId?: string;
  }
}

/**
 * Attaches `req.sessionId` on every request, creating an anonymous Session row
 * if the `sid` cookie is missing or unknown.
 *
 * Invariants:
 * - IP is never stored in plaintext; `ipHash = SHA256(ip + COOKIE_SECRET)` is
 *   written instead. If `COOKIE_SECRET` leaks, the hash becomes predictable —
 *   rotate the secret, but note that doing so invalidates ALL active sessions
 *   (old hashes won't match new ones). There is no migration path; users just
 *   get fresh sessions.
 * - `lastActiveAt` refresh is fire-and-forget. We never await it, so request
 *   latency is unaffected if Postgres is slow. Stale `lastActiveAt` values are
 *   acceptable — the field is informational, not security-relevant.
 * - Cookie is `httpOnly` + `sameSite=lax`. `secure` is true only when both
 *   `NODE_ENV=production` AND `HOST_HAS_TLS=true`. In local dev (no TLS), the
 *   browser would otherwise drop the cookie.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    // Try to read session from signed cookie
    const rawSid =
      (req.signedCookies as Record<string, string | undefined>)['sid'] ??
      (req.cookies as Record<string, string | undefined>)['sid'];

    let sessionId: string | null = null;

    if (rawSid) {
      const existing = await this.prisma.session.findUnique({ where: { id: rawSid } });
      if (existing) {
        sessionId = existing.id;
        // Touch lastActiveAt (fire-and-forget; non-blocking)
        void this.prisma.session.update({
          where: { id: sessionId },
          data: {},  // @updatedAt handles lastActiveAt automatically
        });
      }
    }

    if (!sessionId) {
      const ip = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
      const ipHash = createHash('sha256')
        .update(ip + (env?.COOKIE_SECRET ?? ''))
        .digest('hex');

      const newSession = await this.prisma.session.create({
        data: {
          ipHash,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
      sessionId = newSession.id;
    }

    req.sessionId = sessionId;

    const secure = env?.NODE_ENV === 'production' && env?.HOST_HAS_TLS === 'true';
    res.cookie('sid', sessionId, {
      httpOnly: true,
      signed: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
      secure,
    });

    return true;
  }
}
