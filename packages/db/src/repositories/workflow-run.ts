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
    markRunning(input: { organizationId: string; id: string }) {
      return transition(input, WorkflowRunStatus.RUNNING, {
        startedAt: new Date(),
        error: Prisma.JsonNull,
      });
    },
    markSucceeded(input: { organizationId: string; id: string }, result?: object) {
      return transition(input, WorkflowRunStatus.SUCCEEDED, {
        ...(result ? { result } : {}),
        finishedAt: new Date(),
      });
    },
    markFailed(input: { organizationId: string; id: string }, error: object) {
      return transition(input, WorkflowRunStatus.FAILED, { error, finishedAt: new Date() });
    },
  };

  async function transition(
    input: { organizationId: string; id: string },
    status: WorkflowRunStatus,
    data: Record<string, unknown>,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.workflowRun.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!existing) return null;
      const run = await tx.workflowRun.update({
        where: { id: existing.id },
        data: { status, ...data },
      });
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
