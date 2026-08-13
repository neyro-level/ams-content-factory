import { describe, expect, it } from 'vitest';
import { createWorkerReadinessSignal } from '../../apps/worker/src/readiness.js';
import { startWorker } from '../../apps/worker/src/bootstrap.js';

describe('worker readiness', () => {
  it('emits ready only after queue reconciliation and handler registration', async () => {
    const events: string[] = [];
    const calls: string[] = [];
    const queue = {
      work: async (name: string) => {
        calls.push(`work:${name}`);
      },
      stop: async () => {
        calls.push('stop');
      },
    };

    const result = await startWorker({
      assertEnvironment: () => calls.push('environment'),
      startQueue: async () => {
        calls.push('queue');
        return queue as never;
      },
      createRepository: () => ({}) as never,
      reconcile: async () => {
        calls.push('reconcile');
        return { requeued: 3 };
      },
      createPublicationDispatchHandler: () => async () => ({ outcome: 'SKIPPED' }),
      createAnalyticsCollectionHandler: () => async () => ({ outcome: 'COLLECTED' }),
      reportReady: (signal) => events.push(JSON.stringify(signal)),
    });

    expect(calls).toEqual([
      'environment',
      'queue',
      'reconcile',
      'work:system.health',
      'work:workflow.run',
      'work:publication.dispatch',
    ]);
    expect(result.readiness).toMatchObject({
      event: 'worker.ready',
      ready: true,
      requeuedWorkflowRuns: 3,
    });
    expect(events).toHaveLength(1);
  });

  it('does not report ready and closes the queue when handler registration fails', async () => {
    let reported = false;
    let stopped = false;
    const queue = {
      work: async () => {
        throw new Error('registration failed');
      },
      stop: async () => {
        stopped = true;
      },
    };

    await expect(
      startWorker({
        assertEnvironment: () => undefined,
        startQueue: async () => queue as never,
        createRepository: () => ({}) as never,
        reconcile: async () => ({ requeued: 0 }),
        createPublicationDispatchHandler: () => async () => ({ outcome: 'SKIPPED' }),
        createAnalyticsCollectionHandler: () => async () => ({ outcome: 'COLLECTED' }),
        reportReady: () => {
          reported = true;
        },
      }),
    ).rejects.toThrow('registration failed');

    expect(reported).toBe(false);
    expect(stopped).toBe(true);
  });

  it('creates a supervisor-safe signal without secret data', () => {
    expect(createWorkerReadinessSignal(0)).toMatchObject({
      event: 'worker.ready',
      ready: true,
      registeredQueues: ['system.health', 'workflow.run', 'publication.dispatch'],
      requeuedWorkflowRuns: 0,
    });
  });
});
