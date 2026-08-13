import { Prisma } from '../generated/prisma/client';
import { getPrisma } from '../client';
import type { PrismaClient } from '../generated/prisma/client';

export type RateLimitRepository = {
  consume(input: {
    scope: string;
    subjectHash: string;
    windowStartedAt: Date;
    now: Date;
  }): Promise<{ count: number; windowStartedAt: Date }>;
};

/**
 * A PostgreSQL UPSERT serializes concurrent increments for one scope/subject.
 * It deliberately stores only an already-hashed subject, never IP addresses,
 * API keys or account identifiers in plaintext.
 */
export function createRateLimitRepository(prisma: PrismaClient = getPrisma()): RateLimitRepository {
  return {
    async consume(input) {
      const rows = await prisma.$queryRaw<{ count: number; windowStartedAt: Date }[]>(Prisma.sql`
        INSERT INTO "rate_limit_entry" ("scope", "subjectHash", "windowStartedAt", "count", "updatedAt")
        VALUES (${input.scope}, ${input.subjectHash}, ${input.windowStartedAt}, 1, ${input.now})
        ON CONFLICT ("scope", "subjectHash") DO UPDATE SET
          "windowStartedAt" = CASE
            WHEN "rate_limit_entry"."windowStartedAt" < EXCLUDED."windowStartedAt"
            THEN EXCLUDED."windowStartedAt"
            ELSE "rate_limit_entry"."windowStartedAt"
          END,
          "count" = CASE
            WHEN "rate_limit_entry"."windowStartedAt" < EXCLUDED."windowStartedAt"
            THEN 1
            ELSE "rate_limit_entry"."count" + 1
          END,
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "count", "windowStartedAt"
      `);
      const result = rows[0];
      if (!result) throw new Error('Rate limit increment did not return a result.');
      return result;
    },
  };
}
