import 'dotenv/config';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
  WorkflowRunStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';
import {
  processWorkflowRun,
  UnsupportedWorkflowTypeError,
} from '../../apps/worker/src/workflow-run-handler.js';

const prisma = createPrismaClient();
const tenantRepository = createTenantRepository(prisma);
const workflowRepository = createWorkflowRunRepository(prisma);
const email = 'workflow-run-contract@ams-content-factory.local';

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { organization: { slug: { startsWith: 'workflow-run-contract' } } },
  });
  await prisma.workflowRun.deleteMany({
    where: { organization: { slug: { startsWith: 'workflow-run-contract' } } },
  });
  await prisma.organization.deleteMany({
    where: { slug: { startsWith: 'workflow-run-contract' } },
  });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('workflow run repository', () => {
  it('deduplicates a run and persists controlled status transitions', async () => {
    await prisma.auditLog.deleteMany({
      where: { organization: { slug: { startsWith: 'workflow-run-contract' } } },
    });
    await prisma.workflowRun.deleteMany({
      where: { organization: { slug: { startsWith: 'workflow-run-contract' } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { startsWith: 'workflow-run-contract' } },
    });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: 'Workflow Contract', email },
      update: {},
    });
    const organization = await tenantRepository.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Workflow Contract',
      slug: 'workflow-run-contract',
    });
    const foreignOrganization = await tenantRepository.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: 'Workflow Contract Foreign',
      slug: 'workflow-run-contract-foreign',
    });
    const input = {
      organizationId: organization.id,
      type: 'system.health',
      idempotencyKey: 'workflow-run-contract-key',
      payload: { source: 'integration-test' },
    };
    const runs = await Promise.all(
      Array.from({ length: 8 }, () => workflowRepository.createOrGet(input)),
    );
    const [first, second] = runs;

    expect(first.id).toBe(second.id);
    expect(new Set(runs.map((run) => run.id)).size).toBe(1);
    expect(first.status).toBe(WorkflowRunStatus.QUEUED);

    await expect(
      workflowRepository.markRunning({ organizationId: foreignOrganization.id, id: first.id }),
    ).resolves.toBeNull();
    expect((await prisma.workflowRun.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      WorkflowRunStatus.QUEUED,
    );

    const scope = { organizationId: organization.id, id: first.id };
    const running = await workflowRepository.markRunning(scope);
    const succeeded = await workflowRepository.markSucceeded(scope, { healthy: true });

    expect(running.status).toBe(WorkflowRunStatus.RUNNING);
    expect(running.startedAt).toBeTruthy();
    expect(succeeded.status).toBe(WorkflowRunStatus.SUCCEEDED);
    expect(succeeded.finishedAt).toBeTruthy();

    const auditEvents = await prisma.auditLog.findMany({
      where: { entityId: first.id },
      select: { action: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditEvents.map((event) => event.action)).toEqual([
      'workflow_run.running',
      'workflow_run.succeeded',
    ]);

    const failed = await workflowRepository.createOrGet({
      ...input,
      idempotencyKey: 'workflow-run-failure-contract-key',
    });
    const failure = await workflowRepository.markFailed(
      { organizationId: organization.id, id: failed.id },
      {
        message: 'provider unavailable',
      },
    );
    const failureAudit = await prisma.auditLog.findFirst({
      where: { entityId: failed.id, action: 'workflow_run.failed' },
    });

    expect(failure.status).toBe(WorkflowRunStatus.FAILED);
    expect(failure.error).toEqual({ message: 'provider unavailable' });
    expect(failureAudit).not.toBeNull();

    const unsupported = await workflowRepository.createOrGet({
      ...input,
      type: 'unknown.workflow.type',
      idempotencyKey: 'workflow-run-unsupported-contract-key',
    });
    await expect(
      processWorkflowRun(workflowRepository, {
        organizationId: organization.id,
        id: unsupported.id,
      }),
    ).rejects.toBeInstanceOf(UnsupportedWorkflowTypeError);
    await expect(
      prisma.workflowRun.findUniqueOrThrow({ where: { id: unsupported.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: WorkflowRunStatus.FAILED,
        error: expect.objectContaining({ code: 'UNSUPPORTED_WORKFLOW_TYPE' }),
      }),
    );

    const handled = await workflowRepository.createOrGet({
      ...input,
      idempotencyKey: 'workflow-run-dispatcher-contract-key',
    });
    await expect(
      processWorkflowRun(workflowRepository, {
        organizationId: organization.id,
        id: handled.id,
      }),
    ).resolves.toEqual(expect.objectContaining({ healthy: true, workflowRunId: handled.id }));
    await expect(
      prisma.workflowRun.findUniqueOrThrow({ where: { id: handled.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: WorkflowRunStatus.SUCCEEDED,
        result: expect.objectContaining({ healthy: true, workflowRunId: handled.id }),
      }),
    );
  });
});
