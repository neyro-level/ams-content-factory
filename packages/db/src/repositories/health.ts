import { Prisma } from '../generated/prisma/client';
import { getPrisma } from '../client';

export interface HealthRepository {
  isReady(): Promise<void>;
}

export function createHealthRepository(): HealthRepository {
  return {
    async isReady() {
      await getPrisma().$queryRaw(Prisma.sql`SELECT 1`);
    },
  };
}
