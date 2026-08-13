import 'dotenv/config';
import {
  analyticsCollectWorkflowType,
  createAnalyticsCollectionScheduler,
} from '../../packages/core/src/index.js';
import {
  createPrismaClient,
  createTenantRepository,
  createWorkflowRunRepository,
} from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const workflows = createWorkflowRunRepository(prisma);
const slug = 'analytics-collection-scheduler-contract';
const email = `${slug}@local`;
const publishedAt = new Date('2026-08-12T12:00:00.000Z');

async function createPublishedPublication(input: {
  organizationId: string;
  brandId: string;
  externalAccountId: string;
}) {
  const project = await prisma.contentProject.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      title: input.externalAccountId,
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: input.externalAccountId },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId: input.brandId,
      platform: 'VK',
      externalAccountId: input.externalAccountId,
      name: input.externalAccountId,
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
      publishedAt,
      externalPostId: `post-${input.externalAccountId}`,
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

describe('analytics collection scheduler', () => {
  it('persists exactly three future active-brand collection intents and keeps them out of the queue until due', async () => {
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
      name: 'Analytics first',
      slug: 'analytics-first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Analytics second',
      slug: 'analytics-second',
    });
    const publication = await createPublishedPublication({
      organizationId: organization.id,
      brandId: first.id,
      externalAccountId: 'scheduled-analytics',
    });
    const scheduler = createAnalyticsCollectionScheduler();

    await expect(
      scheduler.schedulePublication({
        organizationId: organization.id,
        brandId: second.id,
        publicationId: publication.id,
      }),
    ).rejects.toThrow('Only a published active-brand publication');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        scheduler.schedulePublication({
          organizationId: organization.id,
          brandId: first.id,
          publicationId: publication.id,
        }),
      ),
    );
    expect(results.every((runs) => runs.length === 3)).toBe(true);

    const runs = await prisma.workflowRun.findMany({
      where: {
        organizationId: organization.id,
        brandId: first.id,
        type: analyticsCollectWorkflowType,
      },
      orderBy: { scheduledFor: 'asc' },
    });
    expect(runs).toEqual([
      expect.objectContaining({
        idempotencyKey: `analytics-collect:${publication.id}:2026-08-13T12:00:00.000Z`,
        scheduledFor: new Date('2026-08-13T12:00:00.000Z'),
        payload: { publicationId: publication.id, capturedAt: '2026-08-13T12:00:00.000Z' },
      }),
      expect.objectContaining({
        scheduledFor: new Date('2026-08-15T12:00:00.000Z'),
        payload: { publicationId: publication.id, capturedAt: '2026-08-15T12:00:00.000Z' },
      }),
      expect.objectContaining({
        scheduledFor: new Date('2026-08-19T12:00:00.000Z'),
        payload: { publicationId: publication.id, capturedAt: '2026-08-19T12:00:00.000Z' },
      }),
    ]);
    const early = await workflows.findQueued({ now: new Date('2026-08-13T11:59:59.000Z') });
    expect(early.some((run) => run.id === runs[0]!.id)).toBe(false);
    const due = await workflows.findQueued({ now: new Date('2026-08-13T12:00:00.000Z') });
    expect(due).toContainEqual(
      expect.objectContaining({ id: runs[0]!.id, organizationId: organization.id }),
    );
  });
});
