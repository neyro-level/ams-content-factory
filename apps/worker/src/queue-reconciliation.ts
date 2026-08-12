import { jobNames } from '@ams-content-factory/jobs';
import type { createWorkflowRunRepository } from '@ams-content-factory/db';

type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;
type Queue = {
  send: (name: string, data: object, options: { singletonKey: string }) => Promise<unknown>;
};

/** Re-enqueue durable intents left QUEUED after an interrupted process or lost broker job. */
export async function reconcileQueuedWorkflowRuns(repository: WorkflowRepository, queue: Queue) {
  const runs = await repository.findQueued();
  await Promise.all(
    runs.map((run) =>
      queue.send(
        jobNames.workflowRun,
        { workflowRunId: run.id, organizationId: run.organizationId },
        { singletonKey: run.id },
      ),
    ),
  );
  return { requeued: runs.length };
}
