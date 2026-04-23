import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsService', () => {
  let service: StatsService;
  let prisma: {
    message: {
      aggregate: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      message: {
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('returns aggregation with messagesProcessed, costTotalUsd, latency percentiles', async () => {
    prisma.message.aggregate.mockResolvedValue({
      _count: { id: 42 },
      _sum: { costUsd: 0.001234 },
    });
    prisma.$queryRaw.mockResolvedValue([{ p50: 120, p95: 350 }]);

    const result = await service.getStats();

    expect(result.messagesProcessed).toBe(42);
    expect(result.costTotalUsd).toBeCloseTo(0.001234, 5);
    expect(result).toHaveProperty('latencyP50Ms');
    expect(result).toHaveProperty('latencyP95Ms');
  });

  it('does not include message content in response (no PII)', async () => {
    prisma.message.aggregate.mockResolvedValue({
      _count: { id: 5 },
      _sum: { costUsd: 0.0005 },
    });
    prisma.$queryRaw.mockResolvedValue([{ p50: 100, p95: 200 }]);

    const result = await service.getStats();
    const serialized = JSON.stringify(result);

    // Result must not contain any content-like keys
    expect(serialized).not.toContain('content');
    expect(serialized).not.toContain('userAgent');
    expect(serialized).not.toContain('ipHash');
  });

  it('handles zero messages gracefully', async () => {
    prisma.message.aggregate.mockResolvedValue({
      _count: { id: 0 },
      _sum: { costUsd: null },
    });
    prisma.$queryRaw.mockResolvedValue([{ p50: null, p95: null }]);

    const result = await service.getStats();

    expect(result.messagesProcessed).toBe(0);
    expect(result.costTotalUsd).toBe(0);
  });
});
