import { startWorker } from './bootstrap';

const { queue } = await startWorker();

const shutdown = async () => {
  await queue.stop();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
