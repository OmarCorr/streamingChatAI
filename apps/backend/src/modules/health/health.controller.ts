import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResult {
  status: 'ok' | 'degraded';
  checks: {
    db: 'ok' | 'fail';
    llm: 'configured' | 'unconfigured';
  };
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check — DB connectivity and LLM configuration status' })
  async check(): Promise<HealthResult> {
    let dbStatus: 'ok' | 'fail' = 'ok';

    try {
      // 1s timeout for DB check
      await Promise.race([
        Promise.resolve(this.prisma.$queryRaw`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB health check timeout')), 1000),
        ),
      ]);
    } catch {
      dbStatus = 'fail';
    }

    const llmStatus: 'configured' | 'unconfigured' = process.env['GEMINI_API_KEY']
      ? 'configured'
      : 'unconfigured';

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      checks: { db: dbStatus, llm: llmStatus },
      timestamp: new Date().toISOString(),
    };
  }
}
