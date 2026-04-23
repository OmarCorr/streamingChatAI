import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../modules/prisma/prisma.service';

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
