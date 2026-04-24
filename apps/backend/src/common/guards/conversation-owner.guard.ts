import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * Verifies the conversation in `:id` belongs to `req.sessionId`.
 *
 * Security: returns **404 Not Found** (never 403 Forbidden) when the
 * conversation exists but belongs to another session. A 403 would leak the
 * existence of conversations across sessions, enabling id enumeration. By
 * returning 404 for both "does not exist" and "exists but not yours", the two
 * cases are indistinguishable to an attacker.
 *
 * Run this guard AFTER `SessionGuard` — it reads `req.sessionId`.
 */
@Injectable()
export class ConversationOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const conversationId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const sessionId = req.sessionId;

    if (!conversationId || !sessionId) {
      throw new NotFoundException();
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, sessionId: true },
    });

    // Resolution 1: 404 not 403 — do NOT reveal existence to foreign sessions
    if (!conversation || conversation.sessionId !== sessionId) {
      throw new NotFoundException();
    }

    return true;
  }
}
