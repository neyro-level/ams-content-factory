import 'dotenv/config';
import {
  createPublicationDispatchScheduler,
  publicationDispatchWorkflowType,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'publication-dispatch-scheduler-contract';
const email = `${slug}@local`;
const now = new Date('2026-08-12T12:00:00.000Z');

async function createQueuedPublication(input: {
  organizationId: string;
  brandId: string;
  externalAccountId: string;
  scheduledAt: Date;
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
      status: 'QUEUED',
      scheduledAt: input.scheduledAt,
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

describe('durable publication dispatch scheduler', () => {
  it('uses due QUEUED publications from PostgreSQL to persist and enqueue one idempotent dispatch intent', async () => {
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
    const brand = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Dispatch scheduler brand',
      slug: 'dispatch-scheduler',
    });
    const due = await createQueuedPublication({
      organizationId: organization.id,
      brandId: brand.id,
      externalAccountId: 'due-publication',
      scheduledAt: new Date('2026-08-12T11:59:59.000Z'),
    });
    await createQueuedPublication({
      organizationId: organization.id,
      brandId: brand.id,
      externalAccountId: 'future-publication',
      scheduledAt: new Date('2026-08-12T12:00:01.000Z'),
    });
    const sends: unknown[][] = [];
    const scheduler = createPublicationDispatchScheduler({
      now: () => now,
      getQueue: async () => ({
        send: async (...args: unknown[]) => {
          sends.push(args);
          return 'pg-boss-job';
        },
      }),
    });

    await expect(scheduler.enqueueDue()).resolves.toEqual(
      expect.objectContaining({ due: 1, enqueued: 1 }),
    );
    await expect(scheduler.enqueueDue()).resolves.toEqual(
      expect.objectContaining({ due: 1, enqueued: 1 }),
    );
    const runs = await prisma.workflowRun.findMany({
      where: { organizationId: organization.id, type: publicationDispatchWorkflowType },
    });
    expect(runs).toEqual([
      expect.objectContaining({
        brandId: brand.id,
        idempotencyKey: `publication-dispatch:${due.id}`,
        payload: { publicationId: due.id },
      }),
    ]);
    expect(sends).toHaveLength(2);
    expect(sends[0]).toEqual([
      'publication.dispatch',
      expect.objectContaining({ workflowRunId: runs[0]!.id, publicationId: due.id }),
      { singletonKey: runs[0]!.id },
    ]);
  });
});
