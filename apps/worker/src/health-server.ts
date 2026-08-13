import { createServer, type Server } from 'node:http';
import { buildHealthPayload } from '@ams-content-factory/config';
import type { WorkerReadinessSignal } from './readiness';

export type WorkerHealthServer = {
  readonly url: string;
  close(): Promise<void>;
};

type WorkerHealthServerOptions = {
  host?: string;
  port?: number;
};

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * The worker has no public HTTP surface. This loopback-only probe is opened
 * after bootstrap has validated runtime config, reached PostgreSQL/pg-boss and
 * registered every active handler. Supervisors can therefore distinguish a
 * running Node process from a worker that can accept durable work.
 */
export async function startWorkerHealthServer(
  readiness: WorkerReadinessSignal,
  options: WorkerHealthServerOptions = {},
): Promise<WorkerHealthServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3205;

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('WORKER_HEALTH_PORT must be an integer between 0 and 65535.');
  }

  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    const check =
      pathname === '/health/live' ? 'live' : pathname === '/health/ready' ? 'ready' : null;
    if (!check) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        ...buildHealthPayload(check),
        worker: {
          registeredQueues: readiness.registeredQueues,
          requeuedWorkflowRuns: readiness.requeuedWorkflowRuns,
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Worker health server did not expose a TCP address.');
  }

  return {
    url: `http://${host}:${address.port}`,
    close: () => closeServer(server),
  };
}
