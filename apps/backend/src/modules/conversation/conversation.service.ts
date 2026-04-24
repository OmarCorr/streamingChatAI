import { Injectable, NotFoundException } from '@nestjs/common';
import { Conversation, Message } from '@streaming-chat/database';
import { PrismaService } from '../prisma/prisma.service';

export type ConversationWithMessages = Conversation & { messages: Message[] };

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable()
export class ConversationService {
  // Maximum number of messages to include in history (PRD §8.1)
  private static readonly MAX_HISTORY = 100;

  constructor(private readonly prisma: PrismaService) {}

  async create(sessionId: string): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        sessionId,
        title: 'New conversation',
      },
    });
  }

  async findAll(sessionId: string): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOwned(id: string, sessionId: string): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation || conversation.sessionId !== sessionId) {
      return null;
    }
    return conversation;
  }

  async findOwnedWithMessages(
    id: string,
    sessionId: string,
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation || conversation.sessionId !== sessionId) {
      return null;
    }
    return conversation;
  }

  async rename(id: string, title: string): Promise<Conversation> {
    try {
      return await this.prisma.conversation.update({
        where: { id },
        data: { title },
      });
    } catch (err) {
      // Prisma throws P2025 when record not found
      const code = (err as { code?: string }).code;
      if (code === 'P2025') {
        throw new NotFoundException(`Conversation ${id} not found`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.conversation.delete({ where: { id } });
  }

  /**
   * Generate an auto-title from the first user message.
   * Max 40 chars + "…" if longer.
   */
  autoTitle(content: string): string {
    if (content.length <= 40) return content;
    return content.slice(0, 40) + '…';
  }

  /**
   * Build conversation history suitable for passing to the LLM.
   *
   * Truncates the OLDEST messages first when the count exceeds MAX_HISTORY —
   * recent context matters most for coherent replies. No DB-level pagination:
   * we load the full message list and slice in JS. This is fine at demo scale
   * (< 500 messages per conversation). If a conversation exceeds several
   * thousand messages, revisit: add a DB-level `take` + `orderBy desc` query
   * and reverse in JS to keep the [oldest → newest] order the LLM expects.
   */
  async buildHistory(conversationId: string): Promise<HistoryMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });

    const limited = messages.slice(-ConversationService.MAX_HISTORY);

    return limited.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }
}
