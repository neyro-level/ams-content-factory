import 'dotenv/config';
import { createAnalyticsService, createTokenEncryptor } from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
  WorkflowRunStatus,
} from '../../packages/db/src/index.js';
import { MockAnalyticsProvider, MockLearningProvider } from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createAnalyticsCollectionHandler } from '../../apps/worker/src/analytics-collection-handler.js';
import { processWorkflowRun } from '../../apps/worker/src/workflow-run-handler.js';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const workflows = createWorkflowRunRepository(prisma);
const slug = 'analytics-collection-worker-contract';
const email = `${slug}@local`;
const encryptor = createTokenEncryptor(Buffer.alloc(32, 61).toString('base64'));

async function createPublishedPublication(input: { organizationId: string; brandId: string }) {
  const project = await prisma.contentProject.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      title: 'Analytics publication',
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: 'Analytics publication' },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: input.brandId,
      platform: 'VK',
      externalAccountId: '-123',
      name: 'Analytics VK',
    },
  });
  await prisma.socialCredential.create({
    data: {
      socialAccountId: account.id,
      accessTokenCiphertext: encryptor.encrypt('analytics-token'),
      encryptionVersion: encryptor.encryptionVersion,
    },
  });
  return prisma.publication.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      status: 'PUBLISHED',
      externalPostId: '-123_42',
      publishedAt: new Date('2026-08-12T00:00:00.000Z'),
    },
  });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.workflowRun.deleteMany({ where: { organization: { slug: { startsWith: slug } } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('durable analytics collection worker', () => {
  it('collects a scoped published publication and fails a malformed or foreign workflow without a snapshot', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { slug } } });
    await prisma.workflowRun.deleteMany({ where: { organization: { slug } } });
    await prisma.organization.deleteMany({ where: { slug } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { name: slug, email },
      update: {},
    });
    const organization = await tenants.createOrganizationWithOwner({
      ownerUserId: user.id,
      name: slug,
      slug,
    });
    const first = await tenants.createBrand({
      organizationId: organization.id,
      name: 'First',
      slug: 'first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Second',
      slug: 'second',
    });
    const publication = await createPublishedPublication({
      organizationId: organization.id,
      brandId: first.id,
    });
    const analytics = createAnalyticsService({
      prisma,
      encryptor,
      providers: {
        VK: new MockAnalyticsProvider('VK'),
        INSTAGRAM: new MockAnalyticsProvider('INSTAGRAM'),
      },
      learningProvider: new MockLearningProvider(),
    });
    const handlers = {
      'analytics.collect': createAnalyticsCollectionHandler(
        analytics,
        () => new Date('2026-08-13T00:00:00.000Z'),
      ),
    };
    const capturedAt = new Date('2026-08-13T00:00:00.000Z');
    const due = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: first.id,
      type: 'analytics.collect',
      idempotencyKey: 'analytics-worker:due',
      payload: { publicationId: publication.id, capturedAt: capturedAt.toISOString() },
      scheduledFor: capturedAt,
    });
    await expect(
      processWorkflowRun(workflows, { organizationId: organization.id, id: due.id }, handlers),
    ).resolves.toMatchObject({
      outcome: 'COLLECTED',
      publicationId: publication.id,
      capturedAt: capturedAt.toISOString(),
    });
    await expect(
      prisma.metricSnapshot.count({ where: { publicationId: publication.id, capturedAt } }),
    ).resolves.toBe(1);
    await expect(prisma.workflowRun.findUniqueOrThrow({ where: { id: due.id } })).resolves.toEqual(
      expect.objectContaining({ status: WorkflowRunStatus.SUCCEEDED }),
    );

    const malformed = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: first.id,
      type: 'analytics.collect',
      idempotencyKey: 'analytics-worker:malformed',
      payload: { publicationId: publication.id, capturedAt: 'not-a-date' },
    });
    await expect(
      processWorkflowRun(
        workflows,
        { organizationId: organization.id, id: malformed.id },
        handlers,
      ),
    ).rejects.toThrow('capturedAt must be a valid date');

    const foreign = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: second.id,
      type: 'analytics.collect',
      idempotencyKey: 'analytics-worker:foreign',
      payload: { publicationId: publication.id, capturedAt: capturedAt.toISOString() },
    });
    await expect(
      processWorkflowRun(workflows, { organizationId: organization.id, id: foreign.id }, handlers),
    ).rejects.toThrow('Only a published publication in the active tenant');
    await expect(
      prisma.metricSnapshot.count({ where: { publicationId: publication.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.workflowRun.findUniqueOrThrow({ where: { id: malformed.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: WorkflowRunStatus.FAILED }));
    await expect(
      prisma.workflowRun.findUniqueOrThrow({ where: { id: foreign.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: WorkflowRunStatus.FAILED }));

    const future = await workflows.createOrGet({
      organizationId: organization.id,
      brandId: first.id,
      type: 'analytics.collect',
      idempotencyKey: 'analytics-worker:future',
      payload: { publicationId: publication.id, capturedAt: capturedAt.toISOString() },
      scheduledFor: new Date('2026-08-14T00:00:00.000Z'),
    });
    await expect(
      processWorkflowRun(workflows, { organizationId: organization.id, id: future.id }, handlers),
    ).rejects.toThrow('not due yet');
    await expect(
      prisma.metricSnapshot.count({ where: { publicationId: publication.id } }),
    ).resolves.toBe(1);
  });
});
