import { startWorker } from './bootstrap';
import { startWorkerHealthServer } from './health-server';

let worker: Awaited<ReturnType<typeof startWorker>>;
try {
  worker = await startWorker();
} catch (error) {
  // This is the process entry boundary: configuration failures must be visible
  // to systemd/Compose logs before any queue or listener is started.
  console.error(error instanceof Error ? error.message : 'Worker startup failed.');
  process.exitCode = 1;
  throw error;
}
const { queue, readiness } = worker;
const workerHealthPort = process.env.WORKER_HEALTH_PORT;
const healthServer = await startWorkerHealthServer(
  readiness,
  workerHealthPort ? { port: Number(workerHealthPort) } : {},
);

const shutdown = async () => {
  await healthServer.close();
  await queue.stop();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
