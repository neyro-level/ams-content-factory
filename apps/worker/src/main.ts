import { startWorker } from './bootstrap';
import { startWorkerHealthServer } from './health-server';

const { queue, readiness } = await startWorker();
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
