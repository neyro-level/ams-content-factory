import 'dotenv/config';
import { assertRuntimeEnvironment } from '../../packages/config/src/index.js';
import { afterEach, describe, expect, it } from 'vitest';
import { startWorker } from '../../apps/worker/src/bootstrap.js';
import {
  startWorkerHealthServer,
  type WorkerHealthServer,
} from '../../apps/worker/src/health-server.js';

let worker: Awaited<ReturnType<typeof startWorker>> | undefined;
let healthServer: WorkerHealthServer | undefined;

const validRuntimeEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'worker-readiness-test-secret-with-at-least-32-characters',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 73).toString('base64'),
};

afterEach(async () => {
  await healthServer?.close();
  await worker?.queue.stop();
  healthServer = undefined;
  worker = undefined;
});

describe('worker real readiness', () => {
  it('reaches PostgreSQL and pg-boss, registers handlers, then exposes loopback readiness', async () => {
    const signals: string[] = [];
    worker = await startWorker({
      assertEnvironment: () => assertRuntimeEnvironment(validRuntimeEnvironment),
      createPublicationDispatchHandler: () => async () => ({ outcome: 'SKIPPED' }),
      createAnalyticsCollectionHandler: () => async () => ({ outcome: 'COLLECTED' }),
      reportReady: (signal) => signals.push(JSON.stringify(signal)),
    });
    healthServer = await startWorkerHealthServer(worker.readiness, { port: 0 });

    const response = await fetch(`${healthServer.url}/health/ready`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      check: 'ready',
      worker: {
        registeredQueues: expect.arrayContaining([
          'system.health',
          'workflow.run',
          'publication.dispatch',
        ]),
      },
    });
    expect(signals).toHaveLength(1);
  });
});
