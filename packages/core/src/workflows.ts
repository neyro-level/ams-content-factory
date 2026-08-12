import { createWorkflowRunRepository } from '@ams-content-factory/db';
import { getManagedJobQueue, jobNames } from '@ams-content-factory/jobs';

type WorkflowRepository = ReturnType<typeof createWorkflowRunRepository>;
type WorkflowQueue = Awaited<ReturnType<typeof getManagedJobQueue>>;

export function createWorkflowEnqueuer(
  options: {
    repository?: WorkflowRepository;
    getQueue?: () => Promise<WorkflowQueue>;
  } = {},
) {
  const repository = options.repository ?? createWorkflowRunRepository();
  const getQueue = options.getQueue ?? getManagedJobQueue;
  return async (input: {
    organizationId: string;
    brandId?: string;
    type: string;
    idempotencyKey: string;
    payload?: object;
  }) => {
    const run = await repository.createOrGet(input);
    const queue = await getQueue();
    await queue.send(
      jobNames.workflowRun,
      { workflowRunId: run.id, organizationId: run.organizationId },
      { singletonKey: run.id },
    );
    return run;
  };
}

let defaultWorkflowEnqueuer: ReturnType<typeof createWorkflowEnqueuer> | undefined;

export async function enqueueWorkflowRun(input: {
  organizationId: string;
  brandId?: string;
  type: string;
  idempotencyKey: string;
  payload?: object;
}) {
  defaultWorkflowEnqueuer ??= createWorkflowEnqueuer();
  return defaultWorkflowEnqueuer(input);
}
