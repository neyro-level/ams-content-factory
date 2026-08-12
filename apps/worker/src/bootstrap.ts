import { createWorkflowRunRepository } from '@ams-content-factory/db';
import { assertRuntimeEnvironment } from '@ams-content-factory/config';
import { jobNames, startJobQueue } from '@ams-content-factory/jobs';
import { reconcileQueuedWorkflowRuns } from './queue-reconciliation';
import { createWorkerReadinessSignal, reportWorkerReadiness } from './readiness';
import { processWorkflowRun } from './workflow-run-handler';

type Queue = Awaited<ReturnType<typeof startJobQueue>>;
type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;

type WorkerDependencies = {
  assertEnvironment?: () => void;
  startQueue?: () => Promise<Queue>;
  createRepository?: () => WorkflowRepository;
  reconcile?: typeof reconcileQueuedWorkflowRuns;
  reportReady?: typeof reportWorkerReadiness;
};

export async function startWorker(dependencies: WorkerDependencies = {}) {
  const assertEnvironment = dependencies.assertEnvironment ?? assertRuntimeEnvironment;
  const startQueue = dependencies.startQueue ?? startJobQueue;
  const createRepository = dependencies.createRepository ?? createWorkflowRunRepository;
  const reconcile = dependencies.reconcile ?? reconcileQueuedWorkflowRuns;
  const reportReady = dependencies.reportReady ?? reportWorkerReadiness;

  assertEnvironment();
  let queue: Queue | undefined;
  try {
    queue = await startQueue();
    const repository = createRepository();
    const reconciliation = await reconcile(repository, queue);

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

    const readiness = createWorkerReadinessSignal(reconciliation.requeued);
    reportReady(readiness);
    return { queue, readiness };
  } catch (error) {
    if (queue) await queue.stop().catch(() => undefined);
    throw error;
  }
}
