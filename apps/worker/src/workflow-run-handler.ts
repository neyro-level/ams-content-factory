import type { createWorkflowRunRepository } from '@ams-content-factory/db';

type WorkflowRunRepository = ReturnType<typeof createWorkflowRunRepository>;
type Scope = { organizationId: string; id: string };

export class UnsupportedWorkflowTypeError extends Error {
  constructor(readonly workflowType: string) {
    super(`No worker handler is registered for workflow type: ${workflowType}`);
    this.name = 'UnsupportedWorkflowTypeError';
  }
}

/**
 * W4.1 fail-closed boundary. A workflow cannot become SUCCEEDED until W4.2's
 * explicit dispatcher invokes a registered handler and receives its result.
 */
export async function processWorkflowRunWithoutDispatcher(
  repository: WorkflowRunRepository,
  scope: Scope,
) {
  const run = await repository.find(scope);
  if (!run) return { skipped: true };

  await repository.markRunning(scope);
  const error = new UnsupportedWorkflowTypeError(run.type);
  await repository.markFailed(scope, {
    code: 'UNSUPPORTED_WORKFLOW_TYPE',
    message: error.message,
    workflowType: run.type,
  });
  throw error;
}
