import { createWorkflowRunRepository } from '@ams-content-factory/db';
import { createJobQueue, jobNames } from '@ams-content-factory/jobs';

export async function enqueueWorkflowRun(input: {
  organizationId: string;
  brandId?: string;
  type: string;
  idempotencyKey: string;
  payload?: object;
}) {
  const repository = createWorkflowRunRepository();
  const run = await repository.createOrGet(input);
  const queue = await createJobQueue();
  await queue.start();
  try {
    await queue.send(jobNames.workflowRun, { workflowRunId: run.id }, { singletonKey: run.id });
  } finally {
    await queue.stop();
  }
  return run;
}
