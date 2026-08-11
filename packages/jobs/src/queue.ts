import { PgBoss } from 'pg-boss';

export const jobNames = {
  health: 'system.health',
  workflowRun: 'workflow.run',
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
  await queue.createQueue(jobNames.analyticsCollect, { retryLimit: 5, retryBackoff: true });
  await queue.createQueue(jobNames.learningAnalyze, { retryLimit: 3, retryBackoff: true });
  return queue;
}
