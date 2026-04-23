/**
 * LangfuseService
 *
 * SDK API (verified from langfuse@3.38.20 types):
 * - Constructor: new Langfuse({ publicKey, secretKey, baseUrl? })
 * - client.trace(body?) → LangfuseTraceClient with .update(body) method
 * - client.flushAsync() → Promise<void>
 *
 * INVARIANT: Every Langfuse call is wrapped in try/catch.
 * Observability MUST NEVER block or crash user-facing requests.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Langfuse } from 'langfuse';

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private client: Langfuse | null = null;

  constructor() {
    try {
      this.client = new Langfuse({
        secretKey: process.env['LANGFUSE_SECRET_KEY'] ?? 'sk-placeholder',
        publicKey: process.env['LANGFUSE_PUBLIC_KEY'] ?? 'pk-placeholder',
        baseUrl: process.env['LANGFUSE_HOST'] ?? 'http://localhost:3100',
      });
    } catch (err) {
      this.logger.warn(`Langfuse init failed: ${(err as Error).message}`);
      this.client = null;
    }
  }

  startTrace(args: { name: string; input: unknown }): unknown {
    try {
      return this.client?.trace({ name: args.name, input: args.input }) ?? null;
    } catch (err) {
      this.logger.warn(`Langfuse startTrace failed: ${(err as Error).message}`);
      return null;
    }
  }

  endTrace(
    trace: unknown,
    args: { status: string; output?: unknown; errorReason?: string },
  ): void {
    try {
      if (trace && typeof (trace as { update?: unknown }).update === 'function') {
        (trace as { update: (body: Record<string, unknown>) => void }).update({
          output: args.output,
          metadata: { status: args.status, errorReason: args.errorReason },
        });
      }
    } catch (err) {
      this.logger.warn(`Langfuse endTrace failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.flushAsync?.();
    } catch (err) {
      this.logger.warn(`Langfuse flush failed: ${(err as Error).message}`);
    }
  }
}
