import 'dotenv/config';
import {
  createAnalyticsService,
  createContentService,
  createPublishingService,
  createTokenEncryptor,
  resolveTenantContext,
} from '../../packages/core/src/index.js';
import { createPrismaClient, createTenantRepository } from '../../packages/db/src/index.js';
import {
  MockAnalyticsProvider,
  MockLearningProvider,
  MockPublishingProvider,
} from '../../packages/providers/src/index.js';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = createPrismaClient();
const tenants = createTenantRepository(prisma);
const slug = 'analytics-contract';
const email = `${slug}@local`;
const encryptor = createTokenEncryptor(Buffer.alloc(32, 9).toString('base64'));

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('analytics foundation', () => {
  it('collects nullable normalized snapshots and isolates brands', async () => {
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
    const firstContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: first.id },
      tenants,
    );
    const secondContext = await resolveTenantContext(
      { userId: user.id, organizationId: organization.id, brandId: second.id },
      tenants,
    );
    const content = createContentService({ prisma });
    const project = await content.create(firstContext, {
      title: 'Analytics project',
      contentType: 'SOCIAL_POST',
    });
    const variant = await prisma.platformVariant.create({
      data: { contentProjectId: project!.id, platform: 'VK', caption: 'Analytics caption' },
    });
    const publishing = createPublishingService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockPublishingProvider('INSTAGRAM'),
        VK: new MockPublishingProvider('VK'),
      },
    });
    const account = await publishing.connectAccount(firstContext, {
      platform: 'VK',
      externalAccountId: 'analytics-account',
      name: 'Analytics account',
      accessToken: 'analytics-secret',
    });
    const publication = await publishing.create(firstContext, {
      contentProjectId: project!.id,
      platformVariantId: variant.id,
      socialAccountId: account.id,
    });
    await publishing.publish(firstContext, {
      id: publication.id,
      idempotencyKey: 'analytics-publish',
    });
    const analytics = createAnalyticsService({
      prisma,
      encryptor,
      providers: {
        INSTAGRAM: new MockAnalyticsProvider('INSTAGRAM'),
        VK: new MockAnalyticsProvider('VK'),
      },
      learningProvider: new MockLearningProvider(),
    });
    const capturedAt = new Date('2026-08-11T12:00:00.000Z');
    await expect(
      analytics.collect(secondContext, { publicationId: publication.id, capturedAt }),
    ).rejects.toThrow('Only a published publication in the active tenant');
    const snapshot = await analytics.collect(firstContext, {
      publicationId: publication.id,
      capturedAt,
    });
    expect(snapshot.views).toBe(100);
    expect(snapshot.saves).toBeNull();
    await analytics.collect(firstContext, { publicationId: publication.id, capturedAt });
    expect(await prisma.metricSnapshot.count({ where: { publicationId: publication.id } })).toBe(1);
    expect(analytics.collectionSchedule(new Date('2026-08-10T00:00:00.000Z'))).toEqual([
      new Date('2026-08-11T00:00:00.000Z'),
      new Date('2026-08-13T00:00:00.000Z'),
      new Date('2026-08-17T00:00:00.000Z'),
    ]);
    const voicesBefore = await prisma.brandVoice.count({ where: { brandId: first.id } });
    const insight = await analytics.analyze(firstContext, {
      periodStart: new Date('2026-08-11T00:00:00.000Z'),
      periodEnd: new Date('2026-08-12T00:00:00.000Z'),
    });
    expect(insight.experiment).toContain('controlled variant');
    expect(await prisma.brandVoice.count({ where: { brandId: first.id } })).toBe(voicesBefore);
    await expect(analytics.list(secondContext)).resolves.toEqual([]);
  });
});
