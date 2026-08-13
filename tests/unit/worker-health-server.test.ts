import { afterEach, describe, expect, it } from 'vitest';
import {
  startWorkerHealthServer,
  type WorkerHealthServer,
} from '../../apps/worker/src/health-server.js';
import { createWorkerReadinessSignal } from '../../apps/worker/src/readiness.js';

let server: WorkerHealthServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('worker loopback readiness probe', () => {
  it('exposes readiness only from a completed bootstrap signal', async () => {
    server = await startWorkerHealthServer(createWorkerReadinessSignal(2), { port: 0 });

    const response = await fetch(`${server.url}/health/ready`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      check: 'ready',
      worker: {
        requeuedWorkflowRuns: 2,
        registeredQueues: expect.arrayContaining(['system.health']),
      },
    });
  });

  it('does not expose an arbitrary endpoint', async () => {
    server = await startWorkerHealthServer(createWorkerReadinessSignal(0), { port: 0 });

    await expect(fetch(`${server.url}/unexpected`)).resolves.toMatchObject({ status: 404 });
  });
});
