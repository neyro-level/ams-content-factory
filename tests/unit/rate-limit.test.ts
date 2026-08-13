import { describe, expect, it } from 'vitest';
import {
  createRateLimitService,
  RateLimitExceededError,
} from '../../packages/core/src/rate-limit.js';

describe('rate limiter', () => {
  it('rejects after the configured limit and reports the remaining window', async () => {
    const calls: Array<{ scope: string; subjectHash: string; windowStartedAt: Date }> = [];
    let count = 0;
    const limiter = createRateLimitService(
      {
        consume: async (input) => {
          calls.push(input);
          count += 1;
          return { count, windowStartedAt: input.windowStartedAt };
        },
      },
      () => new Date('2026-08-13T06:15:10.000Z'),
    );
    const policy = { scope: 'test', limit: 2, windowMs: 60_000 } as const;

    await limiter.consume(policy, 'sensitive-subject');
    await limiter.consume(policy, 'sensitive-subject');
    await expect(
      limiter.consume(policy, 'sensitive-subject'),
    ).rejects.toMatchObject<RateLimitExceededError>({
      retryAfterSeconds: 50,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      scope: 'test',
      windowStartedAt: new Date('2026-08-13T06:15:00.000Z'),
    });
    expect(calls[0]!.subjectHash).not.toContain('sensitive-subject');
  });
});
