import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { StatsService, StatsResult } from './stats.service';

@ApiTags('stats')
@Controller('stats')
@SkipThrottle({ short: true, long: true })
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregated usage statistics' })
  async getStats(): Promise<StatsResult> {
    return this.statsService.getStats();
  }
}
