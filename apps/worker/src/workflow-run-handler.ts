import type { createWorkflowRunRepository } from '@ams-content-factory/db';

type WorkflowRunRepository = ReturnType<typeof createWorkflowRunRepository>;
type Scope = { organizationId: string; id: string };
type WorkflowRun = NonNullable<Awaited<ReturnType<WorkflowRunRepository['find']>>>;

export type WorkflowHandler = (run: WorkflowRun) => Promise<object>;
export type WorkflowHandlers = Readonly<Record<string, WorkflowHandler>>;

export class UnsupportedWorkflowTypeError extends Error {
  constructor(readonly workflowType: string) {
    super(`No worker handler is registered for workflow type: ${workflowType}`);
    this.name = 'UnsupportedWorkflowTypeError';
  }
}

export const registeredWorkflowHandlers: WorkflowHandlers = {
  'system.health': async (run) => ({
    healthy: true,
    workflowRunId: run.id,
  }),
};

/**
 * A closed dispatcher: workflow type, rather than any payload field, selects
 * the handler. New business workflow types must be registered explicitly.
 */
export async function processWorkflowRun(
  repository: WorkflowRunRepository,
  scope: Scope,
  handlers: WorkflowHandlers = registeredWorkflowHandlers,
) {
  const run = await repository.find(scope);
  if (!run) return { skipped: true };

  const handler = handlers[run.type];
  if (!handler) {
    const error = new UnsupportedWorkflowTypeError(run.type);
    await repository.markRunning(scope);
    await repository.markFailed(scope, {
      code: 'UNSUPPORTED_WORKFLOW_TYPE',
      message: error.message,
      workflowType: run.type,
    });
    throw error;
  }

  await repository.markRunning(scope);
  try {
    const result = await handler(run);
    await repository.markSucceeded(scope, result);
    return result;
  } catch (error) {
    await repository.markFailed(scope, {
      code: 'WORKFLOW_HANDLER_FAILED',
      message: error instanceof Error ? error.message : 'Unknown workflow handler error.',
      workflowType: run.type,
    });
    throw error;
  }
}
