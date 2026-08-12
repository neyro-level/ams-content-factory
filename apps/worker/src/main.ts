import { jobNames, startJobQueue } from '@ams-content-factory/jobs';
import { createWorkflowRunRepository } from '@ams-content-factory/db';
import { assertRuntimeEnvironment } from '@ams-content-factory/config';
import { processWorkflowRun } from './workflow-run-handler';
import { reconcileQueuedWorkflowRuns } from './queue-reconciliation';

assertRuntimeEnvironment();
const queue = await startJobQueue();
const repository = createWorkflowRunRepository();
await reconcileQueuedWorkflowRuns(repository, queue);
await queue.work(jobNames.health, async () => ({ healthy: true }));
await queue.work<{ workflowRunId: string; organizationId: string }>(
  jobNames.workflowRun,
  async ([job]) => {
    if (!job) return { skipped: true };

    return processWorkflowRun(repository, {
      organizationId: job.data.organizationId,
      id: job.data.workflowRunId,
    });
  },
);

const shutdown = async () => {
  await queue.stop();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
