import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('extends PrismaClient (has $connect method)', () => {
    expect(typeof service.$connect).toBe('function');
  });

  it('implements OnModuleInit', () => {
    expect(typeof service.onModuleInit).toBe('function');
  });

  it('implements OnModuleDestroy', () => {
    expect(typeof service.onModuleDestroy).toBe('function');
  });
});
