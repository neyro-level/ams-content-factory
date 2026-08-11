import 'dotenv/config';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
  WorkflowRunStatus,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenantRepository = createTenantRepository(prisma);
const workflowRepository = createWorkflowRunRepository(prisma);
const email = 'workflow-run-contract@ams-content-factory.local';

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { organization: { slug: 'workflow-run-contract' } },
  });
  await prisma.workflowRun.deleteMany({
    where: { organization: { slug: 'workflow-run-contract' } },
  });
  await prisma.organization.deleteMany({ where: { slug: 'workflow-run-contract' } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('workflow run repository', () => {
  it('deduplicates a run and persists controlled status transitions', async () => {
    await prisma.auditLog.deleteMany({
      where: { organization: { slug: 'workflow-run-contract' } },
    });
    await prisma.workflowRun.deleteMany({
      where: { organization: { slug: 'workflow-run-contract' } },
    });
    await prisma.organization.deleteMany({ where: { slug: 'workflow-run-contract' } });
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
    const input = {
      organizationId: organization.id,
      type: 'system.health',
      idempotencyKey: 'workflow-run-contract-key',
      payload: { source: 'integration-test' },
    };
    const [first, second] = await Promise.all([
      workflowRepository.createOrGet(input),
      workflowRepository.createOrGet(input),
    ]);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe(WorkflowRunStatus.QUEUED);

    const running = await workflowRepository.markRunning(first.id);
    const succeeded = await workflowRepository.markSucceeded(first.id, { healthy: true });

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
    const failure = await workflowRepository.markFailed(failed.id, {
      message: 'provider unavailable',
    });
    const failureAudit = await prisma.auditLog.findFirst({
      where: { entityId: failed.id, action: 'workflow_run.failed' },
    });

    expect(failure.status).toBe(WorkflowRunStatus.FAILED);
    expect(failure.error).toEqual({ message: 'provider unavailable' });
    expect(failureAudit).not.toBeNull();
  });
});
