import { describe, expect, it } from 'vitest';
import { getManagedJobQueue, resetManagedJobQueueForTests } from '../../packages/jobs/src/index.js';
import { createWorkflowEnqueuer } from '../../packages/core/src/index.js';

describe('managed workflow queue lifecycle', () => {
  it('initializes one queue and reuses it for multiple enqueues without stopping it', async () => {
    resetManagedJobQueueForTests();
    let starts = 0;
    const sends: unknown[][] = [];
    const queue = {
      send: async (...args: unknown[]) => {
        sends.push(args);
        return 'job-id';
      },
    };
    const getQueue = () =>
      getManagedJobQueue(async () => {
        starts += 1;
        return queue as never;
      });
    const repository = {
      createOrGet: async (input: {
        organizationId: string;
        brandId?: string;
        type: string;
        idempotencyKey: string;
        payload?: object;
      }) => ({ id: input.idempotencyKey, organizationId: input.organizationId }),
    };
    const enqueue = createWorkflowEnqueuer({ repository: repository as never, getQueue });

    await enqueue({
      organizationId: 'organization-id',
      type: 'system.health',
      idempotencyKey: 'first',
    });
    await enqueue({
      organizationId: 'organization-id',
      type: 'system.health',
      idempotencyKey: 'second',
    });

    expect(starts).toBe(1);
    expect(sends).toHaveLength(2);
    resetManagedJobQueueForTests();
  });

  it('allows a later retry when queue initialization fails', async () => {
    resetManagedJobQueueForTests();
    let attempts = 0;
    const queue = { send: async () => 'job-id' };

    await expect(
      getManagedJobQueue(async () => {
        attempts += 1;
        throw new Error('database unavailable');
      }),
    ).rejects.toThrow('database unavailable');

    await expect(
      getManagedJobQueue(async () => {
        attempts += 1;
        return queue as never;
      }),
    ).resolves.toBe(queue);

    expect(attempts).toBe(2);
    resetManagedJobQueueForTests();
  });
});
