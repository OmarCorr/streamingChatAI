import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; timestamp: string } {
    // NOTE: full health (DB + LLM + cache) per PRD RF-32 expands in backend-streaming.
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
