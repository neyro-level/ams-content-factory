import { createHash } from 'node:crypto';
import { createRateLimitRepository, type RateLimitRepository } from '@ams-content-factory/db';

export const rateLimitPolicies = {
  auth: { scope: 'auth', limit: 10, windowMs: 15 * 60_000 },
  inboundWebhook: { scope: 'inbound-webhook', limit: 60, windowMs: 60_000 },
  mcp: { scope: 'mcp', limit: 120, windowMs: 60_000 },
  aiGeneration: { scope: 'ai-generation', limit: 5, windowMs: 60_000 },
  externalProvider: { scope: 'external-provider', limit: 20, windowMs: 60_000 },
} as const;

export type RateLimitPolicy = (typeof rateLimitPolicies)[keyof typeof rateLimitPolicies];

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Rate limit exceeded. Please retry later.');
    this.name = 'RateLimitExceededError';
  }
}

function subjectHash(subject: string) {
  return createHash('sha256').update(subject).digest('hex');
}

function windowStart(now: Date, windowMs: number) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function createRateLimitService(
  repository: RateLimitRepository = createRateLimitRepository(),
  now: () => Date = () => new Date(),
) {
  return {
    async consume(policy: RateLimitPolicy, subject: string) {
      const current = now();
      const startedAt = windowStart(current, policy.windowMs);
      const result = await repository.consume({
        scope: policy.scope,
        subjectHash: subjectHash(subject),
        windowStartedAt: startedAt,
        now: current,
      });
      if (result.count <= policy.limit) return;

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((startedAt.getTime() + policy.windowMs - current.getTime()) / 1_000),
      );
      throw new RateLimitExceededError(retryAfterSeconds);
    },
  };
}

export async function limitActor(
  policy: RateLimitPolicy,
  actor: { organizationId: string; userId: string },
) {
  await createRateLimitService().consume(policy, `${actor.organizationId}:${actor.userId}`);
}
