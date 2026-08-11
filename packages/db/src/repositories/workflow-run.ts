import { Prisma, WorkflowRunStatus, type PrismaClient } from '../generated/prisma/client';
import { getPrisma } from '../client';

export function createWorkflowRunRepository(prisma: PrismaClient = getPrisma()) {
  return {
    createOrGet(input: {
      organizationId: string;
      brandId?: string;
      type: string;
      idempotencyKey: string;
      payload?: object;
    }) {
      return prisma.workflowRun.upsert({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        create: { ...input, status: WorkflowRunStatus.QUEUED },
        update: {},
      });
    },
    markRunning(id: string) {
      return transition(id, WorkflowRunStatus.RUNNING, {
        startedAt: new Date(),
        error: Prisma.JsonNull,
      });
    },
    markSucceeded(id: string, result?: object) {
      return transition(id, WorkflowRunStatus.SUCCEEDED, {
        ...(result ? { result } : {}),
        finishedAt: new Date(),
      });
    },
    markFailed(id: string, error: object) {
      return transition(id, WorkflowRunStatus.FAILED, { error, finishedAt: new Date() });
    },
  };

  async function transition(id: string, status: WorkflowRunStatus, data: Record<string, unknown>) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.workflowRun.update({ where: { id }, data: { status, ...data } });
      await tx.auditLog.create({
        data: {
          organizationId: run.organizationId,
          brandId: run.brandId,
          action: `workflow_run.${status.toLowerCase()}`,
          entityType: 'WorkflowRun',
          entityId: run.id,
          metadata: { type: run.type, idempotencyKey: run.idempotencyKey },
        },
      });
      return run;
    });
  }
}
