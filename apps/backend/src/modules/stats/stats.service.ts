import { Injectable } from '@nestjs/common';
import { Prisma } from '@streaming-chat/database';
import { PrismaService } from '../prisma/prisma.service';

export interface StatsResult {
  messagesProcessed: number;
  costTotalUsd: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}

interface PercentileRow {
  p50: number | null;
  p95: number | null;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<StatsResult> {
    const [aggregation, percentileRows] = await Promise.all([
      this.prisma.message.aggregate({
        where: { status: 'complete' },
        _count: { id: true },
        _sum: { costUsd: true },
      }),
      this.prisma.$queryRaw`
        SELECT
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
        FROM "Message"
        WHERE status = 'complete' AND "latencyMs" IS NOT NULL
      ` as Promise<PercentileRow[]>,
    ]);

    const rows = await percentileRows;
    const p50Row = rows[0];

    // Safely convert Decimal to number
    let costTotal = 0;
    if (aggregation._sum.costUsd !== null) {
      const val = aggregation._sum.costUsd;
      costTotal = val instanceof Prisma.Decimal ? val.toNumber() : Number(val);
    }

    return {
      messagesProcessed: aggregation._count.id ?? 0,
      costTotalUsd: costTotal,
      latencyP50Ms: p50Row?.p50 ?? 0,
      latencyP95Ms: p50Row?.p95 ?? 0,
    };
  }
}
