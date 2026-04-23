import { PrismaClient } from '../generated/client';

// Guard against hot-reload duplicate PrismaClient instances in dev.
const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__prisma = prisma;
}

export * from '../generated/client';
export { PrismaClient };
