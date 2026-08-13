import { PgBoss } from 'pg-boss';

export const jobNames = {
  health: 'system.health',
  workflowRun: 'workflow.run',
  publicationDispatch: 'publication.dispatch',
  analyticsCollect: 'analytics.collect',
  learningAnalyze: 'learning.analyze',
} as const;

export function createJobQueue(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required to start the job queue.');
  return new PgBoss({ connectionString, schema: 'pgboss' });
}

export async function startJobQueue(queue = createJobQueue()) {
  queue.on('error', (error) => console.error('pg-boss error', error));
  await queue.start();
  await queue.createQueue(jobNames.health, { retryLimit: 3, retryBackoff: true });
  await queue.createQueue(jobNames.workflowRun, { retryLimit: 5, retryBackoff: true });
  await queue.createQueue(jobNames.publicationDispatch, { retryLimit: 5, retryBackoff: true });
  await queue.createQueue(jobNames.analyticsCollect, { retryLimit: 5, retryBackoff: true });
  await queue.createQueue(jobNames.learningAnalyze, { retryLimit: 3, retryBackoff: true });
  return queue;
}

let managedQueue: Promise<PgBoss> | undefined;

/**
 * Process-lifetime queue for web/application services. Starting pg-boss is a
 * lifecycle concern, not a per-webhook side effect.
 */
export function getManagedJobQueue(start: () => Promise<PgBoss> = startJobQueue) {
  if (!managedQueue) {
    const queue = start();
    managedQueue = queue;
    void queue.catch(() => {
      if (managedQueue === queue) managedQueue = undefined;
    });
  }
  return managedQueue;
}

export async function stopManagedJobQueue() {
  const queue = managedQueue;
  managedQueue = undefined;
  if (queue) await (await queue).stop();
}

/** Test-only reset that never stops an externally supplied fake queue. */
export function resetManagedJobQueueForTests() {
  managedQueue = undefined;
}
