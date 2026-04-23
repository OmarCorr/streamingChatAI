/**
 * ChatService — SSE streaming with Gemini, progressive persistence, cancellation.
 *
 * Design §5 invariants:
 * - writer.flush({ final: true }) is the ONLY terminal write path
 * - AbortController wired to req.on('close') → Gemini SDK config.abortSignal
 * - Langfuse failures NEVER crash the main flow (all wrapped in try/catch)
 * - One ThrottledWriter per stream instance (NOT injectable service)
 *
 * Cancellation billing note (from caveat memory):
 * AbortSignal closes the HTTP connection and stops client from receiving chunks.
 * Google may still bill in-flight generation tokens. Wording in README must reflect this.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { MessageStatus } from '@streaming-chat/database';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { LangfuseService } from '../observability/langfuse.service';
import { CostCalculator } from '../observability/cost-calculator';
import { ConversationService } from '../conversation/conversation.service';
import { ThrottledWriter } from './throttled-writer';
import { SendMessageDto } from './dto/send-message.dto';

interface MessageEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly langfuse: LangfuseService,
    private readonly costCalculator: CostCalculator,
    private readonly conversationService: ConversationService,
  ) {}

  async streamMessage(
    req: Request,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<Observable<MessageEvent>> {
    // 1. Validate ownership
    const conversation = await this.conversationService.findOwned(
      conversationId,
      req.sessionId ?? '',
    );
    if (!conversation) throw new NotFoundException();

    // 2. Persist user message (terminal status on creation)
    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: dto.content,
        status: MessageStatus.complete,
        completedAt: new Date(),
      },
    });

    // 3. Auto-title the conversation if it's the first message
    if (conversation.title === 'New conversation') {
      const title = this.conversationService.autoTitle(dto.content);
      void this.conversationService.rename(conversationId, title).catch((err) =>
        this.logger.warn(`Failed to auto-title conversation: ${(err as Error).message}`),
      );
    }

    // 4. Create assistant message (streaming placeholder)
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: MessageStatus.streaming,
      },
    });

    // 5. Build history (last N messages fitting 30k tokens, PRD §8.1)
    const history = await this.conversationService.buildHistory(conversationId);

    // 6. Wire AbortController to client disconnect
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // 7. Start Langfuse trace (never throws)
    let trace: unknown = null;
    try {
      trace = this.langfuse.startTrace({ name: 'chat-stream', input: history });
    } catch (err) {
      this.logger.warn(`Langfuse startTrace failed: ${(err as Error).message}`);
    }

    // 8. Per-stream throttled writer
    const writer = new ThrottledWriter(this.prisma, assistantMessage.id);

    // Suppress unused variable warning for userMessage
    void userMessage;

    // 9. Return Observable
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          subscriber.next({ type: 'start', data: { messageId: assistantMessage.id } });

          const stream = this.llm.generateContentStream({
            messages: history,
            signal: abortController.signal,
          });

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;
            if (chunk.delta) {
              subscriber.next({ type: 'token', data: { delta: chunk.delta } });
              writer.accumulate(chunk.delta);
            }
            if (chunk.usage) {
              const costUsd = this.costCalculator.calc(
                chunk.usage.tokensInput,
                chunk.usage.tokensOutput,
              );
              subscriber.next({
                type: 'metadata',
                data: {
                  tokensInput: chunk.usage.tokensInput,
                  tokensOutput: chunk.usage.tokensOutput,
                  costUsd,
                },
              });
            }
          }

          const status = abortController.signal.aborted
            ? MessageStatus.cancelled
            : MessageStatus.complete;
          await writer.flush({ final: true, status, completedAt: new Date() });

          try {
            this.langfuse.endTrace(trace, { status, output: writer.content });
          } catch {
            // swallow
          }

          if (status === MessageStatus.complete) {
            subscriber.next({ type: 'done', data: { status: 'complete' } });
          }
          subscriber.complete();
        } catch (err) {
          await writer.flush({
            final: true,
            status: MessageStatus.error,
            errorReason: (err as Error).message,
            completedAt: new Date(),
          });

          try {
            this.langfuse.endTrace(trace, {
              status: 'error',
              errorReason: (err as Error).message,
            });
          } catch {
            // swallow
          }

          subscriber.next({
            type: 'error',
            data: {
              message: this.sanitizeError(err),
            },
          });
          subscriber.complete();
        }
      })();

      // Teardown if subscriber unsubscribes
      return () => {
        if (!abortController.signal.aborted) abortController.abort();
      };
    });
  }

  async regenerateMessage(
    req: Request,
    conversationId: string,
    messageId: string,
  ): Promise<Observable<MessageEvent>> {
    // 1. Validate ownership
    const conversation = await this.conversationService.findOwned(
      conversationId,
      req.sessionId ?? '',
    );
    if (!conversation) throw new NotFoundException();

    // 2. Find the target message and all subsequent messages
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const targetIndex = messages.findIndex((m) => m.id === messageId);
    if (targetIndex === -1) throw new NotFoundException(`Message ${messageId} not found`);

    const targetMessage = messages[targetIndex];
    if (!targetMessage) throw new NotFoundException(`Message ${messageId} not found`);

    if (targetMessage.role === 'user') {
      throw new BadRequestException('cannot regenerate user message');
    }

    // 3. Delete target message and all subsequent messages
    const toDelete = messages.slice(targetIndex);
    for (const msg of toDelete) {
      await this.prisma.message.delete({ where: { id: msg.id } });
    }

    // 4. Find preceding user message to re-stream from
    const precedingMessages = messages.slice(0, targetIndex);
    const precedingUserMessage = [...precedingMessages].reverse().find((m) => m.role === 'user');

    if (!precedingUserMessage) {
      throw new NotFoundException('No preceding user message found to regenerate from');
    }

    // 5. Re-stream using the preceding user message content
    const dto: SendMessageDto = { content: precedingUserMessage.content };

    // Temporarily mark conversation as not auto-titled to prevent re-title
    // We need to create a fake conversation with non-default title to skip auto-title
    const fakeConv = { ...conversation, title: 'Existing conversation' };
    const originalFindOwned = this.conversationService.findOwned.bind(this.conversationService);
    // Use a patched call for this one stream
    void originalFindOwned;

    return this.streamMessageFromExistingConversation(req, conversationId, fakeConv, dto);
  }

  private async streamMessageFromExistingConversation(
    req: Request,
    conversationId: string,
    conversation: { id: string; sessionId: string; title: string },
    _dto: SendMessageDto,
  ): Promise<Observable<MessageEvent>> {
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: MessageStatus.streaming,
      },
    });

    const history = await this.conversationService.buildHistory(conversationId);
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    let trace: unknown = null;
    try {
      trace = this.langfuse.startTrace({ name: 'chat-regenerate', input: history });
    } catch {
      // swallow
    }

    const writer = new ThrottledWriter(this.prisma, assistantMessage.id);
    void conversation; // consumed above

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          subscriber.next({ type: 'start', data: { messageId: assistantMessage.id } });

          const stream = this.llm.generateContentStream({
            messages: history,
            signal: abortController.signal,
          });

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;
            if (chunk.delta) {
              subscriber.next({ type: 'token', data: { delta: chunk.delta } });
              writer.accumulate(chunk.delta);
            }
            if (chunk.usage) {
              const costUsd = this.costCalculator.calc(
                chunk.usage.tokensInput,
                chunk.usage.tokensOutput,
              );
              subscriber.next({
                type: 'metadata',
                data: {
                  tokensInput: chunk.usage.tokensInput,
                  tokensOutput: chunk.usage.tokensOutput,
                  costUsd,
                },
              });
            }
          }

          const status = abortController.signal.aborted
            ? MessageStatus.cancelled
            : MessageStatus.complete;
          await writer.flush({ final: true, status, completedAt: new Date() });

          try {
            this.langfuse.endTrace(trace, { status, output: writer.content });
          } catch {
            // swallow
          }

          if (status === MessageStatus.complete) {
            subscriber.next({ type: 'done', data: { status: 'complete' } });
          }
          subscriber.complete();
        } catch (err) {
          await writer.flush({
            final: true,
            status: MessageStatus.error,
            errorReason: (err as Error).message,
            completedAt: new Date(),
          });
          subscriber.next({
            type: 'error',
            data: { message: this.sanitizeError(err) },
          });
          subscriber.complete();
        }
      })();

      return () => {
        if (!abortController.signal.aborted) abortController.abort();
      };
    });
  }

  private sanitizeError(err: unknown): string {
    const msg = (err as Error)?.message ?? 'Stream error';
    // Don't expose internal details to clients
    if (msg.includes('API key') || msg.includes('auth') || msg.includes('credential')) {
      return 'Service temporarily unavailable';
    }
    return 'Stream error occurred';
  }
}
