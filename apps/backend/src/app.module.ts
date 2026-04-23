import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { LlmModule } from './modules/llm/llm.module';
import { SessionModule } from './modules/session/session.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { ChatModule } from './modules/chat/chat.module';
import { HealthModule } from './modules/health/health.module';
import { StatsModule } from './modules/stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../../.env',
      isGlobal: true,
    }),
    // Two throttle windows: 10/min (short) + 100/day (long) — design §12
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 10 },
      { name: 'long', ttl: 86_400_000, limit: 100 },
    ]),
    PrismaModule,
    ObservabilityModule,
    LlmModule,
    SessionModule,
    ConversationModule,
    ChatModule,
    HealthModule,
    StatsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
