import 'dotenv/config';
import { createPublicationCalendarService } from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'publication-calendar-contract';
const email = `${slug}@local`;

async function createScheduledPublication(input: {
  organizationId: string;
  brandId: string;
  title: string;
  externalAccountId: string;
  scheduledAt?: Date;
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
  const account = await prisma.socialAccount.create({
    data: {
      brandId: input.brandId,
      platform: 'VK',
      externalAccountId: input.externalAccountId,
      name: `${input.title} account`,
    },
  });
  return prisma.publication.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      contentProjectId: project.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
      ...(input.scheduledAt ? { status: 'QUEUED' } : {}),
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    },
  });
}

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: slug } } });
  await prisma.$disconnect();
});

describe('publication calendar', () => {
  it('returns only the active brand range plus its unscheduled drafts for week and month views', async () => {
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
      name: 'Calendar first',
      slug: 'calendar-first',
    });
    const second = await tenants.createBrand({
      organizationId: organization.id,
      name: 'Calendar second',
      slug: 'calendar-second',
    });
    const inWeek = await createScheduledPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'First scheduled publication',
      externalAccountId: 'first-scheduled',
      scheduledAt: new Date('2026-08-12T09:00:00.000Z'),
    });
    const unscheduled = await createScheduledPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'First unscheduled publication',
      externalAccountId: 'first-unscheduled',
    });
    const failed = await createScheduledPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'First failed publication',
      externalAccountId: 'first-failed',
    });
    const failedAttempt = await prisma.publicationAttempt.create({
      data: {
        publicationId: failed.id,
        attempt: 1,
        idempotencyKey: 'first-failed-attempt',
        providerOperation: 'vk:wall.post',
        requestFingerprint: 'test-fingerprint',
        status: 'FAILED',
        errorCode: 'PROVIDER_PUBLISH_FAILED',
      },
    });
    await prisma.publication.update({
      where: { id: failed.id },
      data: { status: 'FAILED', lastAttemptId: failedAttempt.id },
    });
    await prisma.socialAccount.create({
      data: {
        brandId: first.id,
        platform: 'INSTAGRAM',
        externalAccountId: 'first-expired',
        name: 'First expired account',
        status: 'EXPIRED',
      },
    });
    await createScheduledPublication({
      organizationId: organization.id,
      brandId: first.id,
      title: 'First next month publication',
      externalAccountId: 'first-next-month',
      scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
    });
    await createScheduledPublication({
      organizationId: organization.id,
      brandId: second.id,
      title: 'Foreign scheduled publication',
      externalAccountId: 'foreign-scheduled',
      scheduledAt: new Date('2026-08-12T09:00:00.000Z'),
    });
    const actor = { userId: user.id, organizationId: organization.id, brandId: first.id };
    const calendar = createPublicationCalendarService({
      tenantRepository: tenants,
    });

    const week = await calendar.get(actor, {
      view: 'week',
      anchor: new Date('2026-08-12T00:00:00.000Z'),
    });
    expect(week.from).toEqual(new Date('2026-08-10T00:00:00.000Z'));
    expect(week.until).toEqual(new Date('2026-08-17T00:00:00.000Z'));
    expect(week.scheduled).toEqual([
      expect.objectContaining({
        id: inWeek.id,
        contentProject: { title: 'First scheduled publication' },
      }),
    ]);
    expect(week.unscheduledDrafts).toEqual([
      expect.objectContaining({
        id: unscheduled.id,
        contentProject: { title: 'First unscheduled publication' },
      }),
    ]);
    expect(week.publicationIssues).toEqual([
      expect.objectContaining({
        id: failed.id,
        status: 'FAILED',
        title: 'First failed publication',
        errorCode: 'PROVIDER_PUBLISH_FAILED',
      }),
    ]);
    expect(week.issueAccounts).toEqual([
      expect.objectContaining({ name: 'First expired account', status: 'EXPIRED' }),
    ]);

    const month = await calendar.get(actor, {
      view: 'month',
      anchor: new Date('2026-08-12T00:00:00.000Z'),
    });
    expect(month.from).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(month.until).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(month.scheduled).toHaveLength(1);
  });
});
