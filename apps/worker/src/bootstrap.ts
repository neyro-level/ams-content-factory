import { createWorkflowRunRepository } from '@ams-content-factory/db';
import { assertRuntimeEnvironment } from '@ams-content-factory/config';
import { jobNames, startJobQueue } from '@ams-content-factory/jobs';
import { reconcileQueuedWorkflowRuns } from './queue-reconciliation';
import { createWorkerReadinessSignal, reportWorkerReadiness } from './readiness';
import { processWorkflowRun, registeredWorkflowHandlers } from './workflow-run-handler';
import { createProductionPublicationDispatchHandler } from './publication-dispatch-handler';
import { createProductionAnalyticsCollectionHandler } from './analytics-collection-handler';

type Queue = Awaited<ReturnType<typeof startJobQueue>>;
type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;

type WorkerDependencies = {
  assertEnvironment?: () => void;
  startQueue?: () => Promise<Queue>;
  createRepository?: () => WorkflowRepository;
  reconcile?: typeof reconcileQueuedWorkflowRuns;
  reportReady?: typeof reportWorkerReadiness;
  createPublicationDispatchHandler?: typeof createProductionPublicationDispatchHandler;
  createAnalyticsCollectionHandler?: typeof createProductionAnalyticsCollectionHandler;
};

export async function startWorker(dependencies: WorkerDependencies = {}) {
  const assertEnvironment = dependencies.assertEnvironment ?? assertRuntimeEnvironment;
  const startQueue = dependencies.startQueue ?? startJobQueue;
  const createRepository = dependencies.createRepository ?? createWorkflowRunRepository;
  const reconcile = dependencies.reconcile ?? reconcileQueuedWorkflowRuns;
  const reportReady = dependencies.reportReady ?? reportWorkerReadiness;
  const createPublicationDispatchHandler =
    dependencies.createPublicationDispatchHandler ?? createProductionPublicationDispatchHandler;
  const createAnalyticsCollectionHandler =
    dependencies.createAnalyticsCollectionHandler ?? createProductionAnalyticsCollectionHandler;

  assertEnvironment();
  let queue: Queue | undefined;
  try {
    queue = await startQueue();
    const repository = createRepository();
    const reconciliation = await reconcile(repository, queue);
    const publicationDispatchHandler = createPublicationDispatchHandler();
    const analyticsCollectionHandler = createAnalyticsCollectionHandler();
    const workflowHandlers = {
      ...registeredWorkflowHandlers,
      'analytics.collect': analyticsCollectionHandler,
    };

    await queue.work(jobNames.health, async () => ({ healthy: true }));
    await queue.work<{ workflowRunId: string; organizationId: string }>(
      jobNames.workflowRun,
      async ([job]) => {
        if (!job) return { skipped: true };
        return processWorkflowRun(
          repository,
          { organizationId: job.data.organizationId, id: job.data.workflowRunId },
          workflowHandlers,
        );
      },
    );
    await queue.work<{ workflowRunId: string; organizationId: string; publicationId: string }>(
      jobNames.publicationDispatch,
      async ([job]) => {
        if (!job) return { skipped: true };
        if (!job.data.publicationId) return { skipped: true };
        return processWorkflowRun(
          repository,
          { organizationId: job.data.organizationId, id: job.data.workflowRunId },
          { 'publication.dispatch': publicationDispatchHandler },
        );
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
