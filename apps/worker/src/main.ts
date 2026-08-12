import { jobNames, startJobQueue } from '@ams-content-factory/jobs';
import { createWorkflowRunRepository } from '@ams-content-factory/db';

const queue = await startJobQueue();
await queue.work(jobNames.health, async () => ({ healthy: true }));
await queue.work<{ workflowRunId: string; organizationId: string }>(
  jobNames.workflowRun,
  async ([job]) => {
    if (!job) return { skipped: true };

    const repository = createWorkflowRunRepository();
    const scope = { organizationId: job.data.organizationId, id: job.data.workflowRunId };
    await repository.markRunning(scope);
    try {
      const result = { handledAt: new Date().toISOString() };
      await repository.markSucceeded(scope, result);
      return result;
    } catch (error) {
      await repository.markFailed(scope, {
        message: error instanceof Error ? error.message : 'Unknown worker error',
      });
      throw error;
    }
  },
);

const shutdown = async () => {
  await queue.stop();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
