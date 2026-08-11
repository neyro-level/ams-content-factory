import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required for database access.');
  }

  return value;
}

export function createPrismaClient(connectionString = databaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const prismaGlobal = globalThis as typeof globalThis & {
  amsContentFactoryPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (!prismaGlobal.amsContentFactoryPrisma) {
    prismaGlobal.amsContentFactoryPrisma = createPrismaClient();
  }

  return prismaGlobal.amsContentFactoryPrisma;
}
