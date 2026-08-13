import 'dotenv/config';
import {
  createPublicationCalendarService,
  createPublicationSchedulingService,
  PublicationSchedulingError,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'publication-scheduling-contract';
const email = `${slug}@local`;
const now = new Date('2026-08-12T12:00:00.000Z');

async function createDraftPublication(input: {
  organizationId: string;
  brandId: string;
  title: string;
  accountId: string;
}) {
  const project = await prisma.contentProject.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      title: input.title,
      contentType: 'SOCIAL_POST',
      status: 'APPROVED',
    },
  });
  const variant = await prisma.platformVariant.create({
    data: { contentProjectId: project.id, platform: 'VK', caption: input.title },
  });
  return prisma.publication.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: input.accountId,
    },
  });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { organization: { is: { slug: { startsWith: slug } } } },
  });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('publication scheduling transition', () => {
  it('moves a scoped DRAFT to QUEUED with a future timestamp exactly once', async () => {
    await prisma.auditLog.deleteMany({ where: { organization: { is: { slug } } } });
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
      name: 'Schedule first',
      slug: 'schedule-first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Schedule second',
      slug: 'schedule-second',
    });
    const account = await prisma.socialAccount.create({
      data: {
        brandId: first.id,
        platform: 'VK',
        externalAccountId: 'schedule-vk',
        name: 'Schedule VK',
      },
    });
    const draft = await createDraftPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'Schedule draft',
      accountId: account.id,
    });
    const service = createPublicationSchedulingService({
      tenantRepository: tenants,
      now: () => now,
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: first.id };
    const scheduledAt = new Date('2026-08-13T09:00:00.000Z');

    await expect(service.schedule(actor, { id: draft.id, scheduledAt })).resolves.toEqual(
      expect.objectContaining({ status: 'QUEUED', scheduledAt }),
    );
    expect(
      await prisma.auditLog.findFirst({
        where: {
          organizationId: organization.id,
          action: 'publication.schedule',
          entityId: draft.id,
        },
      }),
    ).toMatchObject({
      brandId: first.id,
      actorUserId: user.id,
      metadata: { scheduledAt: scheduledAt.toISOString() },
    });
    const rescheduledAt = new Date('2026-08-14T09:00:00.000Z');
    await expect(
      service.reschedule(actor, { id: draft.id, scheduledAt: rescheduledAt }),
    ).resolves.toEqual(
      expect.objectContaining({ id: draft.id, status: 'QUEUED', scheduledAt: rescheduledAt }),
    );
    await expect(
      prisma.publication.count({
        where: {
          organizationId: organization.id,
          brandId: first.id,
          contentProjectId: draft.contentProjectId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      service.reschedule({ ...actor, brandId: second.id }, { id: draft.id, scheduledAt }),
    ).rejects.toBeInstanceOf(PublicationSchedulingError);
    await expect(service.cancel(actor, draft.id)).resolves.toEqual(
      expect.objectContaining({ id: draft.id, status: 'CANCELLED' }),
    );
    await expect(
      createPublicationCalendarService({ tenantRepository: tenants }).get(actor, {
        view: 'week',
        anchor: new Date('2026-08-12T12:00:00.000Z'),
      }),
    ).resolves.toEqual(expect.objectContaining({ scheduled: [] }));
    await expect(service.cancel(actor, draft.id)).rejects.toBeInstanceOf(
      PublicationSchedulingError,
    );
    await expect(service.reschedule(actor, { id: draft.id, scheduledAt })).rejects.toBeInstanceOf(
      PublicationSchedulingError,
    );
    await expect(service.schedule(actor, { id: draft.id, scheduledAt })).rejects.toBeInstanceOf(
      PublicationSchedulingError,
    );
    const expiredDraft = await createDraftPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'Expired schedule draft',
      accountId: account.id,
    });
    await expect(
      service.schedule(actor, {
        id: expiredDraft.id,
        scheduledAt: new Date('2026-08-12T12:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(PublicationSchedulingError);
    const foreignDraft = await createDraftPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'Foreign schedule draft',
      accountId: account.id,
    });
    await expect(
      service.schedule({ ...actor, brandId: second.id }, { id: foreignDraft.id, scheduledAt }),
    ).rejects.toBeInstanceOf(PublicationSchedulingError);
  });
});
