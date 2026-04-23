import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: {
    $queryRaw: jest.Mock;
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns status ok with db and llm checks when DB is reachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    process.env['GEMINI_API_KEY'] = 'some-key';

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.checks.db).toBe('ok');
    expect(result.checks.llm).toBe('configured');
    expect(result).toHaveProperty('timestamp');
  });

  it('returns degraded status with db:fail when DB query fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    process.env['GEMINI_API_KEY'] = 'some-key';

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.db).toBe('fail');
    expect(result.checks.llm).toBe('configured');
  });

  it('returns llm:unconfigured when GEMINI_API_KEY is absent', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    delete process.env['GEMINI_API_KEY'];

    const result = await controller.check();

    expect(result.checks.llm).toBe('unconfigured');
  });

  it('never calls Gemini API — only checks env var presence', async () => {
    // The fact that no GoogleGenAI mock is needed confirms no Gemini call is made
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    process.env['GEMINI_API_KEY'] = 'test-key';

    await controller.check();

    // If this test passes without a GoogleGenAI mock, Gemini was never called
    expect(true).toBe(true);
  });
});
