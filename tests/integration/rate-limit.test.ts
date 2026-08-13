import 'dotenv/config';
import { createRateLimitService, RateLimitExceededError } from '../../packages/core/src/index.js';
import { createPrismaClient, createRateLimitRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const scope = `rate-limit-integration-${Date.now()}`;

afterAll(async () => {
  await prisma.rateLimitEntry.deleteMany({ where: { scope } });
  await prisma.$disconnect();
});

describe('PostgreSQL rate limit repository', () => {
  it('serializes parallel increments without persisting the raw subject', async () => {
    const limiter = createRateLimitService(createRateLimitRepository(prisma));
    const policy = { scope, limit: 3, windowMs: 60_000 } as const;

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => limiter.consume(policy, 'private-api-key-or-address')),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(3);
    expect(results.filter((result) => result.status === 'rejected')[0]).toMatchObject({
      reason: expect.any(RateLimitExceededError),
    });
    const stored = await prisma.rateLimitEntry.findFirstOrThrow({ where: { scope } });
    expect(stored.count).toBe(6);
    expect(stored.subjectHash).not.toContain('private-api-key-or-address');
  });
});
